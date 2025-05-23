import fs from "fs/promises";
import path from "path";
import {tmpdir} from "os";
import { expect } from "chai";
import Vfs, { FileProps, GetFileParams, Scene, WriteFileParams } from "./index.js";
import { Uid } from "../utils/uid.js";
import UserManager from "../auth/UserManager.js";
import User from "../auth/User.js";
import { BadRequestError, ConflictError, NotFoundError } from "../utils/errors.js";
import ScenesVfs from "./Scenes.js";
import { collapseAsync } from "../utils/wrapAsync.js";

async function *dataStream(src :Array<Buffer|string> =["foo", "\n"]){
  for(let d of src){
    let b = Buffer.isBuffer(d)?d: Buffer.from(d);
    yield await Promise.resolve(b);
  }
}

async function empty(dir :string){
  return (await fs.readdir(dir)).length == 0;
}

function sceneProps(id:number): {[P in keyof Required<Scene>]: Function|any}{
  return {
    ctime: Date,
    mtime: Date,
    id: id,
    name: "foo",
    author: "default",
    author_id: 0,
    thumb: null,
    tags: [],
    access:  { any: 'read', default: 'read' },
    archived: false,
  };
}

describe("Vfs", function(){
  this.beforeEach(async function(){
    this.dir = await fs.mkdtemp(path.join(tmpdir(), `vfs_tests`));
    this.uploads = path.join(this.dir, "uploads"); //For quick reference
  });
  this.afterEach(async function(){
    await fs.rm(this.dir, {recursive: true});
  })
  it("opens upload directory", async function(){
    await Vfs.Open(this.dir);
    await expect(fs.access(path.join(this.dir, "uploads"))).to.be.fulfilled;
  });

  describe("isolate", function(){
    it("can rollback on error", async function(){
      let vfs = await Vfs.Open(this.dir);
      await expect(vfs.isolate(async (vfs)=>{
        await vfs.createScene("foo");
        await vfs.createScene("foo");
      })).to.be.rejected;
      expect(await vfs.getScenes()).to.have.property("length", 0);
    });

    it("reuses a connection when nested", async function(){
      let vfs = await Vfs.Open(this.dir);
      await expect(vfs.isolate( async (v2)=>{
        await v2.isolate(async (v3)=>{
          expect(v3._db).to.equal(v2._db);
        });
      })).to.be.fulfilled;
    });

    it("can be nested (success)", async function(){
      let vfs = await Vfs.Open(this.dir);
      let scenes = await expect(vfs.isolate( async (v2)=>{
        await v2.getScenes();
        await v2.isolate(async (v3)=>{
          await v3.getScenes();
          await v3.createScene("foo");
        });
        await v2.getScenes();
        await v2.createScene("bar")
        return await v2.getScenes();
      })).to.be.fulfilled;
      expect(scenes).to.have.property("length", 2);
      await expect(vfs.getScenes()).to.eventually.deep.equal(scenes);
    });

    it("can be nested (with caught error)", async function(){
      let vfs = await Vfs.Open(this.dir);
      let scenes = await expect(vfs.isolate( async (v2)=>{
        await v2.createScene("foo");
        //This isolate rolls back but since we don't propagate the error
        //the parent will succeed
        await v2.isolate(async (v3)=>{
          await v3.createScene("bar");
          //Force this transaction to roll back
          throw new Error("TEST");
        }).catch(e=>{
          if(e.message !== "TEST") throw e;
        });
        return await v2.getScenes();
      })).to.be.fulfilled;
      expect(scenes).to.have.property("length", 1);
      expect(scenes[0]).to.have.property("name", "foo");
      expect(await vfs.getScenes()).to.deep.equal(scenes);
    });

    it("is properly closed on success", async function(){
      let vfs = await Vfs.Open(this.dir);
      let _transaction:Vfs|null =null;
      await expect(vfs.isolate(async tr=>{
        _transaction = tr;
        expect(_transaction).to.have.property("isOpen", true);
      })).to.be.fulfilled;
      expect(_transaction).to.have.property("isOpen", false);
    })

    it("is properly closed on error", async function(){
      let vfs = await Vfs.Open(this.dir);
      let _transaction:Vfs|null =null;
      await expect(vfs.isolate(async tr=>{
        _transaction = tr;
        expect(_transaction).to.have.property("isOpen", true);
        throw new Error("dummy");
      })).to.be.rejectedWith("dummy");
      expect(_transaction).to.have.property("isOpen", false);
    })
  });

  describe("validate search params", function(){
    it("accepts no parameters", function(){
      expect(()=>ScenesVfs._validateSceneQuery({})).not.to.throw();
    });

    it("requires limit to be a positive integer", function(){
      [null, "foo", 0.5, "0", 0, -1, 101].forEach((limit)=>{
        expect(()=>ScenesVfs._validateSceneQuery({limit} as any), `{limit: ${limit}}`).to.throw();
      });

      [1, 10, 100].forEach((limit)=>{
        expect(()=>ScenesVfs._validateSceneQuery({limit} as any)).not.to.throw();
      });
    });

    it("requires offset to be a positive integer", function(){
      [null, "foo", 0.5, "0", -1].forEach((offset)=>{
        expect(()=>ScenesVfs._validateSceneQuery({offset} as any), `{offset: ${offset}}`).to.throw();
      });

      [0, 1, 10, 100, 1000].forEach((offset)=>{
        expect(()=>ScenesVfs._validateSceneQuery({offset} as any)).not.to.throw();
      });
    });

    it("requires orderDirection to match", function(){
      ["AS", "DE", null, 0, -1, 1, "1"].forEach((orderDirection)=>{
        expect(()=>ScenesVfs._validateSceneQuery({orderDirection} as any), `{orderDirection: ${orderDirection}}`).to.throw("Invalid orderDirection");
      });
      ["ASC", "DESC", "asc", "desc"].forEach((orderDirection)=>{
        expect(()=>ScenesVfs._validateSceneQuery({orderDirection} as any)).not.to.throw();
      })
    });

    it("requires orderBy to match", function(){
      ["foo", 1, -1, null].forEach((orderBy)=>{
        expect(()=>ScenesVfs._validateSceneQuery({orderBy} as any), `{orderBy: ${orderBy}}`).to.throw(`Invalid orderBy`);
      });

      ["ctime", "mtime", "name"].forEach((orderBy)=>{
        expect(()=>ScenesVfs._validateSceneQuery({orderBy} as any), `{orderBy: "${orderBy}"}`).not.to.throw();
      });
    });

    it("sanitizes access values", function(){
      expect(()=>ScenesVfs._validateSceneQuery({access:["none", "read"] as any})).not.to.throw();
      [
        ["foo"],
        [undefined],
        ["read", "foo"]
      ].forEach(a=>{
        expect(()=>ScenesVfs._validateSceneQuery({access: a as any}),`expected ${a ?? typeof a} to not be an accepted access value`).to.throw(`Bad access type requested`);
      });
    });

    it("sanitizes author ids", function(){
      [ 0, 1, 100 ].forEach(a=>{
        expect(()=>ScenesVfs._validateSceneQuery({author: a})).not.to.throw();
      });
      [ null, "0", "foo", -1 ].forEach(a=>{
        expect(()=>ScenesVfs._validateSceneQuery({author: a as any}),`expected ${a ?? typeof a} to not be an accepted author value`).to.throw(`[400] Invalid author filter request: ${a}`);
      });
    })
  });

  describe("toDate()", function(){
    //Parse dates stored in the database
    it("parse a date string without timezone", async function(){
      let d = Vfs.toDate("2024-01-11 14:44:59")
      expect(d.valueOf()).to.equal(new Date("2024-01-11 14:44:59Z").valueOf());
    });
    it("parse a GMT date", async function(){
      let d = Vfs.toDate("2024-01-11 14:44:59Z")
      expect(d.valueOf()).to.equal(new Date("2024-01-11 14:44:59Z").valueOf());
    });
    it("parse a local ISO8601 date", async function(){
      let d = Vfs.toDate("2024-01-11 14:44:59+01")
      expect(d.valueOf()).to.equal(new Date("2024-01-11 14:44:59+01").valueOf());
    });
  })

  describe("", function(){
    let vfs :Vfs; 
    //@ts-ignore
    const run = async (sql: ISqlite.SqlType, ...params: any[])=> await vfs.db.run(sql, ...params);
    //@ts-ignore
    const get = async (sql: ISqlite.SqlType, ...params: any[])=> await vfs.db.get(sql, ...params);
    //@ts-ignore
    const all = async (sql: ISqlite.SqlType, ...params: any[])=> await vfs.db.all(sql, ...params);

    this.beforeEach(async function(){
      vfs = await Vfs.Open(this.dir);
    });

    describe("createScene()", function(){
      it("insert a new scene", async function(){
        await expect(vfs.createScene("foo")).to.be.fulfilled;
      })
      it("throws on duplicate name", async function(){
        await expect(vfs.createScene("foo")).to.be.fulfilled;
        await expect(vfs.createScene("foo")).to.be.rejectedWith("exist");
      });

      describe("uid handling", function(){
        let old :typeof Uid.make;
        let returns :number[] = [];
        this.beforeEach(function(){
          old = Uid.make;
          returns = [];
          Uid.make = ()=> {
            let r = returns.pop();
            if (typeof r === "undefined") throw new Error("No mock result provided");
            return r;
          };
        });
        this.afterEach(function(){
          Uid.make = old;
        });

        it("fails if no free uid can be found", async function(){
          returns = [1, 1, 1, 1];
          await expect(vfs.createScene("bar")).to.be.fulfilled;
          await expect(vfs.createScene("baz")).to.be.rejectedWith("Unable to find a free id");
        });

        it("retry", async function(){
          returns = [1, 1, 2];
          await expect(vfs.createScene("bar")).to.be.fulfilled;
          await expect(vfs.createScene("baz")).to.be.fulfilled;
        });

        it("prevents scene name containing uid", async function(){
          returns = [1, 2];
          let scene_id = await expect(vfs.createScene("bar#1")).to.be.fulfilled;
          expect(scene_id).to.equal(2);
        });
      })

      it("sets scene author", async function(){
        const userManager = new UserManager(vfs._db);
        const user = await userManager.addUser("alice", "xxxxxxxx", false);
        let id = await expect(vfs.createScene("foo", user.uid)).to.be.fulfilled;
        let s = await vfs.getScene(id, user.uid);
        expect(s).to.have.property("access").to.have.property("user", "admin");
      });

      it("sets custom scene permissions", async function(){
        const userManager = new UserManager(vfs._db);
        const user = await userManager.addUser("alice", "xxxxxxxx", false);
        let id = await expect(vfs.createScene("foo", {"0": "none",[user.uid.toString()]:"write"})).to.be.fulfilled;
        let s = await vfs.getScene(id, user.uid);
        expect(s.access).to.deep.equal({"default": "none", "any": "read", "user": "write"});
      })
    });

    describe("getScenes()", function(){
      it("get an empty list", async function(){
        let scenes = await vfs.getScenes();
        expect(scenes).to.have.property("length", 0);
      })

      it("get a list of scenes", async function(){
        let scene_id = await vfs.createScene("foo");
        let scenes = await vfs.getScenes();
        expect(scenes).to.have.property("length", 1);
        let scene = scenes[0];

        let props = sceneProps(scene_id);
        let key:keyof Scene;
        for(key in props){
          if(typeof props[key] ==="undefined"){
            expect(scene, `${(scene as any)[key]}`).not.to.have.property(key);
          }else if(typeof props[key] === "function"){
            expect(scene).to.have.property(key).instanceof(props[key]);
          }else{
            expect(scene).to.have.property(key).to.deep.equal(props[key]);
          }
        }
      });

      it("get proper ctime and mtime from last document edit", async function(){
        let t2 = new Date();
        let t1 = new Date(Date.now()-100000);
        let scene_id = await vfs.createScene("foo");
        await vfs.writeDoc("{}", {scene: scene_id, user_id: 0, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
        let $doc_id = (await vfs.writeDoc("{}", {scene: scene_id, user_id: 0, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"})).id;
        //Force ctime
        await run(`UPDATE scenes SET ctime = $time`, {$time: t1.toISOString()});
        await run(`UPDATE files SET ctime = $time WHERE file_id = $doc_id`, {$time: t2.toISOString(), $doc_id});
        let scenes = await vfs.getScenes();
        expect(scenes).to.have.property("length", 1);
        expect(scenes[0].ctime.valueOf(), `ctime is ${scenes[0].ctime}, expected ${t1}`).to.equal(t1.valueOf());
        expect(scenes[0].mtime.valueOf(), `mtime is ${scenes[0].mtime}, expected ${t2}`).to.equal(t2.valueOf());
      });

      it("orders by names, case-insensitive and ascending", async function(){
        await Promise.all([
          vfs.createScene("a1"),
          vfs.createScene("aa"),
          vfs.createScene("Ab"),
        ]);
        let scenes = await vfs.getScenes();
        let names = scenes.map(s=>s.name);
        expect(names).to.deep.equal(["a1", "aa", "Ab"]);
      });

      it("can return existing thumbnails", async function(){
        let s1 = await vfs.createScene("01");
        await vfs.writeDoc("\n", {scene: s1, user_id:0, name: "scene-image-thumb.jpg", mime: "image/jpeg"});
        let s2 = await vfs.createScene("02");
        await vfs.writeDoc("\n", {scene: s2, user_id:0, name: "scene-image-thumb.png", mime: "image/jpeg"});

        let s = await vfs.getScenes(0);
        expect(s).to.have.property("length", 2);
        expect(s[0]).to.have.property("thumb", "scene-image-thumb.jpg");
        expect(s[1]).to.have.property("thumb", "scene-image-thumb.png");
      });

      it("returns the last-saved thumbnail", async function(){
        let s1 = await vfs.createScene("01");
        let times = [
          new Date("2022-01-01"),
          new Date("2023-01-01"),
          new Date("2024-01-01")
        ];
        const setDate = (i:number, d:Date)=>vfs._db.run(`UPDATE files SET ctime = $time WHERE file_id = $id`, {$id: i, $time: d});
        let png = await vfs.writeDoc("\n", {scene: s1, user_id: 0, name: "scene-image-thumb.png", mime: "image/png"});
        let jpg = await vfs.writeDoc("\n", {scene: s1, user_id: 0, name: "scene-image-thumb.jpg", mime: "image/jpeg"});

        let r = await setDate(jpg.id, times[1]);
        await setDate(png.id, times[2]);
        let s = await vfs.getScenes(0);
        expect(s).to.have.length(1);
        expect(s[0], `use PNG thumbnail if it's the most recent`).to.have.property("thumb", "scene-image-thumb.png");

        await setDate(png.id, times[0]);
        s = await vfs.getScenes(0);
        expect(s[0], `use JPG thumbnail if it's the most recent`).to.have.property("thumb", "scene-image-thumb.jpg");

        //If date is equal, prioritize jpg
        await setDate(png.id, times[1]);
        s = await vfs.getScenes(0);
        expect(s[0], `With equal dates, alphanumeric order shopuld prioritize JPG over PNG file`).to.have.property("thumb", "scene-image-thumb.jpg");
      });

      it("can get archived scenes", async function(){
        let scene_id = await vfs.createScene("foo");
        await vfs.writeDoc(JSON.stringify({foo: "bar"}), {scene: scene_id, user_id: 0, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
        await vfs.archiveScene(scene_id);
        let scenes = await vfs.getScenes();
        expect(scenes.map(({name})=>({name}))).to.deep.equal([{name: `foo#${scene_id}`}]);
      });
      

      it("can get only archived scenes (no requester)", async function(){
        await vfs.createScene("bar");
        let scene_id = await vfs.createScene("foo");
        await vfs.writeDoc(JSON.stringify({foo: "bar"}), {scene: scene_id, user_id: 0, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
        await vfs.archiveScene(scene_id);

        //Two scenes total
        expect(await vfs.getScenes()).to.have.length(2);
        //Filter only scenes with access: none
        let scenes = await vfs.getScenes(null, {archived: true});
        console.log(JSON.stringify(scenes));
        expect(scenes.map(({name})=>({name}))).to.deep.equal([{name: `foo#${scene_id}`}]);
      });

      it("can get an author's own archived scenes", async function(){
        let um :UserManager= new UserManager(vfs._db);
        let user = await um.addUser("bob", "12345678", false, "bob@example.com")
        //Create a reference non-archived scene (shouldn't be shown)
        await vfs.createScene("bar", user.uid);
        //Create a scene owned by someone else
        await vfs.createScene("baz");
        //Create our archived scene
        let scene_id = await vfs.createScene("foo", user.uid);
        await vfs.writeDoc(JSON.stringify({foo: "bar"}), {scene: scene_id, user_id: 0, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
        await vfs.archiveScene(scene_id);

        //Three scenes total
        expect(await vfs.getScenes()).to.have.length(3);
        //Two "existing" scenes
        expect(await vfs.getScenes(user.uid, {archived: false})).to.have.length(2);

        //Filter only scenes with access: none
        let scenes = await vfs.getScenes(user.uid, {archived: true});
        console.log(JSON.stringify(scenes));
        expect(scenes.map(({name})=>({name}))).to.deep.equal([{name: `foo#${scene_id}`}]);
      })

      describe("with permissions", function(){
        let userManager :UserManager, user :User;
        this.beforeEach(async function(){
          userManager = new UserManager(vfs._db);
          user = await userManager.addUser("alice", "xxxxxxxx", false);
        });

        it("can filter accessible scenes by user_id", async function(){
          await vfs.createScene("foo", user.uid);
          await run(`UPDATE scenes SET access = json_object("0", "none", "${user.uid}", "admin")`);
          expect(await vfs.getScenes(0), `private scene shouldn't be returned to default user`).to.have.property("length", 0);
          expect(await vfs.getScenes(user.uid), `private scene should be returned to its author`).to.have.property("length", 1);
        });

        it("get proper author id and name", async function(){
          let scene_id = await vfs.createScene("foo", user.uid);
          await vfs.writeDoc("{}", {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
          let scenes = await vfs.getScenes();
          expect(scenes).to.have.property("length", 1);
          expect(scenes[0]).to.have.property("author", user.username);
          expect(scenes[0]).to.have.property("author_id", user.uid);
        });
        
        it("get proper user own access", async function(){
          let scene_id = await vfs.createScene("foo", {[user.uid.toString(10)]: "admin", "1": "write", "0": "none"});
          let scenes = await vfs.getScenes(user.uid);
          expect(scenes).to.have.property("length", 1);
          expect(scenes[0]).to.have.property("access").to.deep.equal({user:"admin", any: "write", default: "none"});
        });
        it("get proper \"any\" access", async function(){
          let scene_id = await vfs.createScene("foo", {"0":"read", "1": "write"});
          let scenes = await vfs.getScenes(user.uid);
          expect(scenes).to.have.property("length", 1);
          expect(scenes[0]).to.have.property("access").to.deep.equal({user: "none", any: "write", default: "read"});
        });
      });

      describe("search", async function(){
        let userManager :UserManager, user :User, admin :User;
        this.beforeEach(async function(){
          userManager = new UserManager(vfs._db);
          user = await userManager.addUser("bob", "xxxxxxxx", false);
          admin = await userManager.addUser("alice", "xxxxxxxx", true);
        });

        it("filters by access-level", async function(){
          await vfs.createScene("foo", {[`${admin.uid}`]: "admin", [`${user.uid}`]: "read"});
          expect(await vfs.getScenes(user.uid, {})).to.have.property("length", 1);
          expect(await vfs.getScenes(user.uid, {access:["admin"]})).to.have.property("length", 0);
        });

        it("won't return inaccessible content", async function(){
          await vfs.createScene("foo", {[`${admin.uid}`]: "admin", [`${user.uid}`]: "none", "0":"none", "1": "none"});
          expect(await vfs.getScenes(user.uid, {access:["none"]})).to.have.property("length", 0);
        });

        it("can select by specific user access level", async function(){
          await vfs.createScene("foo", {[`${admin.uid}`]: "admin", [`${user.uid}`]: "read", "0":"read", "1": "read"});
          expect(await vfs.getScenes(user.uid, {access:["read"]})).to.have.property("length", 1);
        });

        it("filters by author", async function(){
          await vfs.createScene("User Authored", user.uid);
          await vfs.createScene("Admin Authored", admin.uid);
          let s = await vfs.getScenes(user.uid, {author: user.uid});
          expect(s, `Matched Scenes: [${s.map(s=>s.name).join(", ")}]`).to.have.property("length", 1);
        });

        it("filters by name match", async function(){
          await vfs.createScene("Hello World", user.uid);
          await vfs.createScene("Goodbye World", user.uid);
          let s = await vfs.getScenes(user.uid, {match: "Hello"})
          expect(s, `Matched Scenes: [${s.map(s=>s.name).join(", ")}]`).to.have.property("length", 1);
        });

        it("Can have wildcards in name match", async function(){
          await vfs.createScene("Hello World", user.uid);
          await vfs.createScene("Goodbye World", user.uid);
          let s = await vfs.getScenes(user.uid, {match: "He%o"})
          expect(s, `[${s.map(s=>s.name).join(", ")}]`).to.have.property("length", 1);
        });

        it("can match a document's meta title", async function(){
          let scene_id = await vfs.createScene("foo", user.uid);
          await vfs.writeDoc(JSON.stringify({
            metas: [{collection:{
              titles:{EN: "Hello World", FR: "Bonjour, monde"}
            }}]
          }), {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
          let s = await vfs.getScenes(user.uid, {match: "He%o"});
          expect(s, `[${s.map(s=>s.name).join(", ")}]`).to.have.property("length", 1);
        });

        it("can match a document's article lead", async function(){
          let scene_id = await vfs.createScene("foo", user.uid);
          await vfs.writeDoc(JSON.stringify({
            metas: [{
              articles:[
                {leads:{EN: "Hello"}}
              ]
            }]
          }), {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
          let s = await vfs.getScenes(user.uid, {match: "He%o"});
          expect(s, `[${s.map(s=>s.name).join(", ")}]`).to.have.property("length", 1);
        });

        it("is case-insensitive", async function(){
          await vfs.createScene("Hello World", user.uid);
          let s = await vfs.getScenes(user.uid, {match: "hello"})
          expect(s, `[${s.map(s=>s.name).join(", ")}]`).to.have.property("length", 1);
        });

        it("can match the author's name", async function(){
          let scene_id = await vfs.createScene("foo", user.uid);
          await vfs.writeDoc(JSON.stringify({}), {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
          let s = await vfs.getScenes(user.uid, {match: user.username});
          expect(s, `[${s.map(s=>s.name).join(", ")}]`).to.have.property("length", 1);
        });

        it.skip("can match an editor's name", async function(){
          //This could have too much impact performance to query properly?
          let scene_id = await vfs.createScene("foo", admin.uid);
          await vfs.writeDoc(JSON.stringify({}), {scene: scene_id, user_id: admin.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});

          let s = await vfs.getScenes(user.uid, {match: user.username});
          expect(s, `Matched scenes : [${s.map(s=>s.name).join(", ")}]`).to.have.property("length", 0);
          
          await vfs.writeDoc(JSON.stringify({scene: 0}), {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
          
          s = await vfs.getScenes(user.uid, {match: user.username});
          expect(s, `Matched scenes : [${s.map(s=>s.name).join(", ")}]`).to.have.property("length", 1);
        });

        it("can search against multiple search terms", async function(){
          let scene_id = await vfs.createScene("bar", user.uid);
          await vfs.writeDoc(JSON.stringify({
            metas: [{
              articles:[
                {leads:{EN: "Hello World, this is User"}}
              ]
            }]
          }), {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});

          scene_id = await vfs.createScene("foo1", admin.uid);
          await vfs.writeDoc(JSON.stringify({}), {scene: scene_id, user_id: admin.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});

          scene_id = await vfs.createScene("foo2", user.uid);
          await vfs.writeDoc(JSON.stringify({}), {scene: scene_id, user_id: admin.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
          
          let s = await vfs.getScenes(user.uid, {match: `foo ${user.username}`});
          expect(s, `[${s.map(s=>s.name).join(", ")}]`).to.have.property("length", 1);
          expect(s[0]).to.have.property("name", "foo2");

          s = await vfs.getScenes(user.uid, {match: `Hello User`});
          expect(s, `[${s.map(s=>s.name).join(", ")}]`).to.have.property("length", 1);
          expect(s[0]).to.have.property("name", "bar");
        });


        it("can match an empty string", async function(){
          await vfs.createScene("Hello World", user.uid);
          await vfs.createScene("Goodbye World", user.uid);
          let s = await vfs.getScenes(user.uid, {match: ""})
          expect(s, `Matched Scenes: [${s.map(s=>s.name).join(", ")}]`).to.have.property("length", 2);
        });

      });

      describe("ordering", function(){
        it("rejects bad orderBy key", async function(){
          await expect(vfs.getScenes(0, {orderBy: "bad" as any})).to.be.rejectedWith("Invalid orderBy: bad");
        })
        it("rejects bad orderDirection key", async function(){
          await expect(vfs.getScenes(0, {orderDirection: "bad" as any})).to.be.rejectedWith("Invalid orderDirection: bad");
        });
        it("can order by name descending", async function(){
          for(let i = 0; i < 10; i++){
            await vfs.createScene(`${i}_scene`);
          }
          const scenes = await vfs.getScenes(0, {orderBy: "name", orderDirection: "desc"});
          expect(scenes.map(s=>s.name)).to.deep.equal([9,8,7,6,5,4,3,2,1,0].map(n=>n+"_scene"));
        });
      });

      describe("pagination", function(){
        it("rejects bad LIMIT", async function(){
          let fixtures = [-1, "10", null];
          for(let f of fixtures){
            await expect(vfs.getScenes(0, {limit: f as any})).to.be.rejectedWith(BadRequestError);
          }
        });

        it("rejects bad OFFSET", async function(){
          let fixtures = [-1, "10", null];
          for(let f of fixtures){
            await expect(vfs.getScenes(0, {limit: f as any})).to.be.rejectedWith(BadRequestError);
          }
        });

        it("respects pagination options", async function(){
          for(let i = 0; i < 10; i++){
            await vfs.createScene(`scene_${i}`);
          }
          let res = await vfs.getScenes(0, {limit: 1, offset: 0})
          expect(res).to.have.property("length", 1);
          expect(res[0]).to.have.property("name", "scene_0");

          res = await vfs.getScenes(0, {limit: 2, offset: 2})
          expect(res).to.have.property("length", 2);
          expect(res[0]).to.have.property("name", "scene_2");
          expect(res[1]).to.have.property("name", "scene_3");
        });

        it("limits LIMIT to 100", async function(){
          await expect(vfs.getScenes(0, {limit: 110, offset: 0})).to.be.rejectedWith("[400]");
        });
      });
    });

    describe("createFolder(), removeFolder(), listFolders()", function(){
      let scene_id :number;
      this.beforeEach(async function(){
        scene_id = await vfs.createScene("foo", 0);
      })

      it("create a folder in a scene", async function(){
        await vfs.createFolder({scene:scene_id, name: "videos", user_id: 0});
        let folders =  await collapseAsync(vfs.listFolders(scene_id));
        //order is by mtime descending, name ascending so we can't rely on it
        expect(folders.map(f=>f.name)).to.have.members(["articles", "models", "videos"]);
        expect(folders).to.have.length(3);
      });

      it("create a tree of folders", async function(){
        await vfs.createFolder({scene:scene_id, name: "articles/videos",  user_id: 0});
        let folders =  await collapseAsync(vfs.listFolders(scene_id));
        expect(folders.map(f=>f.name)).to.deep.equal(["articles", "articles/videos", "models"]);
      });

      it("don't accept a trailing slash", async function(){
        await expect(vfs.createFolder({scene:scene_id, name: "videos/", user_id: 0})).to.be.rejectedWith(BadRequestError);
      });

      it("don't accept absolute paths", async function(){
        await expect(vfs.createFolder({scene:scene_id, name: "/videos", user_id: 0})).to.be.rejectedWith(BadRequestError);
      });

      it("throws an error if folder exists", async function(){
        await vfs.createFolder({scene: scene_id, name: "videos",  user_id: 0});
        await expect( vfs.createFolder({scene: scene_id, name: "videos",  user_id: 0}) ).to.be.rejectedWith(ConflictError);
      });

      it("throws an error if folder doesn't exist", async function(){
        await expect(vfs.removeFolder({scene: scene_id, name: "videos", user_id: 0})).to.be.rejectedWith(NotFoundError);
      });

      it("remove a scene's folder", async function(){
        await vfs.createFolder({scene:scene_id, name: "videos", user_id: 0});
        await vfs.removeFolder({scene: scene_id, name: "videos", user_id: 0});
        let folders = await collapseAsync(vfs.listFolders(scene_id));
        expect(folders.map(f=>f.name)).to.deep.equal(["articles", "models"]);
        await vfs.createFolder({scene:scene_id, name: "videos", user_id: 0});
        folders = await collapseAsync(vfs.listFolders(scene_id));
        expect(folders.map(f=>f.name).sort()).to.deep.equal(["videos", "models", "articles"].sort());
      });

      it("removeFolder() removes all files in the folder", async function(){
        let userManager = new UserManager(vfs._db);
        let user = await userManager.addUser("alice", "xxxxxxxx", false);
        await vfs.createFolder({scene:scene_id, name: "videos", user_id: 0});
        await vfs.writeFile(dataStream(), {scene: scene_id, name: "videos/foo.mp4", mime:"video/mp4", user_id: 0});

        await vfs.removeFolder({scene: scene_id, name: "videos", user_id: user.uid });

        let files = await collapseAsync(vfs.listFiles(scene_id));
        expect(files).to.deep.equal([]);
      });
    });

    describe("tags", function(){
      let scene_id :number;
      //Create a dummy scene for future tests
      this.beforeEach(async function(){
        scene_id = await vfs.createScene("foo");
      });

      describe("addSceneTag() / removeSceneTag()", function(){
        it("adds a tag to a scene", async function(){
          await vfs.addTag(scene_id, "foo");
          let s = await vfs.getScene(scene_id);
          expect(s).to.have.property("tags").to.deep.equal(["foo"]);
          await vfs.addTag(scene_id, "bar");
          s = await vfs.getScene(scene_id);
          //Ordering is loosely expected to hold: we do not enforce AUTOINCREMENT on rowids but it's generally true
          expect(s).to.have.property("tags").to.deep.equal(["foo", "bar"]);
        });

        it("can remove tag", async function(){
          await expect(vfs.addTag(scene_id, "foo")).to.eventually.equal(true);
          await expect(vfs.addTag(scene_id, "bar")).to.eventually.equal(true);
          await expect(vfs.removeTag(scene_id, "foo")).to.eventually.equal(true);

          let s = await vfs.getScene(scene_id);
          expect(s).to.have.property("tags").to.deep.equal(["bar"]);
        });

        it("can be called with scene name", async function(){
          await expect(vfs.addTag("foo", "foo")).to.eventually.equal(true);
          let s = await vfs.getScene(scene_id);
          expect(s).to.have.property("tags").to.deep.equal(["foo"]);

          await expect(vfs.removeTag("foo", "foo")).to.eventually.equal(true);
        });

        it("throws a 404 errors if scene doesn't exist", async function(){
          // by id
          await expect(vfs.addTag(scene_id+1, "foo")).to.be.rejectedWith(NotFoundError);
          // by name
          await expect(vfs.addTag("baz", "foo")).to.be.rejectedWith(NotFoundError);

        });


        it("returns false if nothing was changed", async function(){
          await vfs.addTag(scene_id, "foo");
          //When tag is added twice, by scene_id
          await expect(vfs.addTag(scene_id, "foo")).to.eventually.equal(false);
          //When tag is added twice, by name
          await expect(vfs.addTag("foo", "foo")).to.eventually.equal(false);

          //When tag doesn't exist
          await expect(vfs.removeTag(scene_id, "bar")).to.be.eventually.equal(false);
          //When scene doesn't exist
          await expect(vfs.removeTag(scene_id+1, "foo")).to.eventually.equal(false);
        });

        it("force lower case ascii characters", async function(){
          await expect(vfs.addTag(scene_id, "Foo")).to.eventually.equal(true);
          await expect(vfs.addTag(scene_id, "foo")).to.eventually.equal(false);
          expect(await vfs.getTags()).to.deep.equal([{name: "foo", size: 1}]);
        });

        it("force lower case for non-ascii characters", async function(){
          await expect(vfs.addTag(scene_id, "Électricité")).to.eventually.equal(true);
          await expect(vfs.addTag(scene_id, "électricité")).to.eventually.equal(false);
          expect(await vfs.getTags()).to.deep.equal([{name: "électricité", size: 1}]);
        });

        it("force lower case for non-latin characters", async function(){
          await expect(vfs.addTag(scene_id, "ΑΒΓΔΕ")).to.eventually.equal(true);
          await expect(vfs.addTag(scene_id, "αβγδε")).to.eventually.equal(false);
          expect(await vfs.getTags()).to.deep.equal([{name: "αβγδε", size: 1}]);
        });
      });


      describe("getTags()", function(){
        it("get all tags", async function(){
          //Create a bunch of additional test scenes
          for(let i=0; i < 3; i++){
            let id = await vfs.createScene(`test_${i}`);
            for(let j=0; j <= i; j++ ){
              await vfs.addTag(id, `tag_${j}`);
            }
          }
          expect(await vfs.getTags()).to.deep.equal([
            {name: "tag_0", size: 3},
            {name: "tag_1", size: 2},
            {name: "tag_2", size: 1},
          ]);
        });

        it("get tags matching a string", async function(){
          await vfs.addTag(scene_id, `tag_foo`);
          await vfs.addTag(scene_id, `foo_tag`);
          await vfs.addTag(scene_id, `tag_bar`);
          expect(await vfs.getTags("foo")).to.deep.equal([
            {name:"foo_tag", size: 1},
            {name: "tag_foo", size: 1},
          ]);
        });
      });

      describe("getTag()", function(){
        it("Get all scenes attached to a tag", async function(){
          let ids = [];
          for(let i=0; i < 3; i++){
            let id = await vfs.createScene(`test_${i}`);
            ids.push(id);
            await vfs.addTag(id, `tag_foo`);
          }
          for(let i=3; i < 6; i++){
            let id = await vfs.createScene(`test_${i}`);
            await vfs.addTag(id, `tag_bar`);
          }
          let scenes = await vfs.getTag("tag_foo");
          expect(scenes).to.deep.equal(ids);
        });


        describe("respects permissions", function(){
          let userManager :UserManager, alice :User, bob :User;
          this.beforeEach(async function(){
            let userManager = new UserManager(vfs._db);
            alice = await userManager.addUser("alice", "12345678", true);
            bob = await userManager.addUser("bob", "12345678", false);
          });

          it("return scenes with read access", async function(){
            await vfs.addTag("foo", "foo");
            expect(await vfs.getTag("foo", alice.uid), "with admin user_id").to.deep.equal([scene_id]);

            expect(await vfs.getTag("foo", bob.uid), "with normal user id").to.deep.equal([scene_id]);
          });

          it("won't return non-readable scene", async function(){
            const id = await vfs.createScene("admin-only", {"0": "none", "1": "none", [alice.uid.toString(10)]: "admin"});
            await vfs.addTag("admin-only", "foo");
            expect(await vfs.getTag("foo"), "without user_id").to.deep.equal([id]);

            expect(await vfs.getTag("foo", alice.uid), "with admin user_id").to.deep.equal([id]);

            expect(await vfs.getTag("foo", bob.uid)).to.deep.equal([]);
          });
        })
      });
    });

    describe("", function(){
      let scene_id :number;
      //Create a dummy scene for future tests
      this.beforeEach(async function(){
        scene_id = await vfs.createScene("foo");
      });
      
      describe("renameScene()", function(){
        it("can change a scene name", async function(){
          await expect(vfs.renameScene(scene_id, "bar")).to.be.fulfilled;
        });
        it("throw a 404 error", async function(){
          await expect(vfs.renameScene(404, "bar")).to.be.rejectedWith("404");
        });
      })

      describe("archiveScene()", function(){
        it("makes scene hidden", async function(){
          await vfs.archiveScene("foo");
          expect(await vfs.getScenes(0, {archived: false})).to.have.property("length", 0);
        });


        it("can't archive twice", async function(){
          await vfs.archiveScene(scene_id);
          await expect(vfs.archiveScene(scene_id), (await vfs._db.all("SELECT * FROM scenes"))[0].scene_name).to.be.rejectedWith(NotFoundError);
        });

        it("can remove archived scene (by id)", async function(){
          await vfs.archiveScene(scene_id);
          await expect(vfs.removeScene(scene_id)).to.be.fulfilled;
        });
        
        it("can remove archived scene (by name)", async function(){
          await vfs.archiveScene(scene_id);
          await expect(vfs.removeScene(`foo#${scene_id}`)).to.be.fulfilled;
        });

        it("store archive time", async function(){
          //To be used later 
          await vfs.archiveScene(scene_id);
          let {archived} = await vfs._db.get(`SELECT archived FROM scenes WHERE scene_id= ?`, [scene_id]);
          expect(archived).to.be.ok;
          let archivedDate = new Date(archived*1000);
          expect(archivedDate.toString()).not.to.equal('Invalid Date');
          expect(archivedDate.valueOf(), archivedDate.toUTCString()).to.be.above(new Date().valueOf() - 2000);
          expect(archivedDate.valueOf(), archivedDate.toUTCString()).to.be.below(new Date().valueOf()+1);
        })
      });

      describe("unarchiveScene()", function(){
        it("restores an archived scene", async function(){
          await vfs.archiveScene(scene_id);
          await vfs.unarchiveScene(`foo#${scene_id}`);
          expect(await vfs.getScene("foo")).to.have.property("archived", false);
        });

        it("throws if archive doesn't exist", async function(){
          await expect(vfs.unarchiveScene("xxx")).to.be.rejectedWith(NotFoundError);
        })
      })

      describe("createFile()", function(){
        it("can create an empty file", async function(){
          let r = await vfs.createFile( {scene: "foo", mime: "text/html", name: "articles/foo.txt", user_id: 0}, {hash: null, size: 0});
          expect(r).to.have.property("id");
          expect(r).to.have.property("generation", 1);
          expect(r).to.have.property("hash", null);
        });

        it("can create a dummy file", async function(){
          let r = await vfs.createFile( {scene: "foo", mime: "text/html", name: "articles/foo.txt", user_id: 0}, {hash: "xxxxxx", size: 150});
        })

        it("autoincrements generation", async function(){
          await vfs.createFile( {scene: "foo", mime: "text/html", name: "articles/foo.txt", user_id: 0}, {hash: "xxxxxx", size: 150});
          let r = await vfs.createFile( {scene: "foo", mime: "text/html", name: "articles/foo.txt", user_id: 0}, {hash: "yyyyy", size: 150});
          expect(r).to.have.property("generation", 2);
        })
        it("can copy a file", async function(){
          let foo = await vfs.createFile( {scene: "foo", mime: "text/html", name: "articles/foo.txt", user_id: 0}, {hash: "xxxxxx", size: 150});
          let bar = await vfs.createFile( {scene: "foo", mime: "text/html", name: "articles/bar.txt", user_id: 0}, {hash: "xxxxxx", size: 150});
          expect(bar).to.have.property("id").not.equal(foo.id);
          expect(bar).to.have.property("generation", 1);
          expect(bar).to.have.property("hash", foo.hash);
          expect(bar).to.have.property("size", foo.size);
        });

      })
      describe("writeFile()", function(){
        it("can upload a file (relative)", async function(){
          let r = await vfs.writeFile(dataStream(["foo","\n"]), {scene: "foo", mime: "text/html", name: "articles/foo.txt", user_id: 0});
          expect(r).to.have.property("id").a("number");
          expect(r).to.have.property("generation", 1);
          await expect(fs.access(path.join(this.dir, "objects", r.hash as any)), "can't access object file").to.be.fulfilled;
          await expect(empty(this.uploads));
        });

        it("can upload a file (absolute)", async function(){
          let r = await expect(
            vfs.writeFile(dataStream(["foo","\n"]), {scene: "foo", mime: "text/html", name: "articles/foo.txt", user_id: 0})
          ).to.be.fulfilled;
          expect(r).to.have.property("generation", 1);
          expect(r).to.have.property("id").a("number");

          await expect(fs.access(path.join(this.dir, "objects", r.hash)), "can't access object file").to.be.fulfilled;
          await expect(empty(this.uploads));
        });
        it("gets proper generation", async function(){
          await vfs.writeFile(dataStream(["foo","\n"]), {scene: "foo", mime: "text/html", name: "articles/foo.txt", user_id: 0});
          for(let i=2; i < 5; i++){
            let foo = await vfs.writeFile(dataStream(["bar","\n"]), {scene: "foo", mime: "text/html", name: "articles/foo.txt", user_id: 0});
            expect(foo).to.have.property("generation", i);
          }
          let bar = await vfs.writeFile(dataStream(["bar","\n"]), {scene: "foo", mime: "text/html", name: "articles/bar.txt", user_id: 0});
          expect(bar).to.have.property("generation", 1);
        });
        it("can upload over an existing file", async function(){
          await expect(
            vfs.writeFile(dataStream(["foo","\n"]), {scene: "foo", mime: "text/html", name: "articles/foo.txt", user_id: 0})
          ).to.eventually.have.property("generation", 1);
          let r = await expect(
            vfs.writeFile(dataStream(["bar","\n"]), {scene: "foo", mime: "text/html", name: "articles/foo.txt", user_id: 0})
          ).to.be.fulfilled;

          expect(r).to.have.property("generation", 2);
          await expect(fs.access(path.join(this.dir, "objects", r.hash)), "can't access object file").to.be.fulfilled;
          await expect(empty(this.uploads));
        });
  
        it("cleans up on errors", async function(){
          async function* badStream(){
            yield Promise.resolve(Buffer.from("foo"));
            yield Promise.reject(new Error("CONNRESET"));
          }
          await expect(vfs.writeFile(badStream(), {scene: "foo", mime: "text/html", name: "articles/foo.txt", user_id: 0})).to.be.rejectedWith("CONNRESET");
          await expect(fs.access(path.join(this.dir, "foo.txt")), "can't access foo.txt").to.be.rejectedWith("ENOENT");
          await expect(empty(this.uploads));
        });
      });



      describe("", function(){
        let r:FileProps, ctime :Date;
        let props :GetFileParams = {scene: "foo", name: "articles/foo.txt"};
        this.beforeEach(async function(){
          r = await vfs.writeFile(dataStream(["foo","\n"]), {...props, mime: "text/html", user_id: 0} );
          ctime = r.ctime;
        });
        describe("getFileProps", function(){
          it("get a file properties", async function(){
            let r = await expect(vfs.getFileProps(props)).to.be.fulfilled;
            expect(r).to.have.property("generation", 1);
            expect(r).to.have.property("ctime").instanceof(Date);
            expect(r).to.have.property("mtime").instanceof(Date);
            expect(r.ctime.valueOf()).to.equal(ctime.valueOf());
            expect(r.mtime.valueOf()).to.equal(ctime.valueOf());
          });
          it("uses the same format as writeFile", async function(){
            await expect(vfs.getFileProps(props)).to.eventually.deep.equal(r);
          })
          it("get proper mtime and ctime", async function(){
            let mtime = new Date(Math.floor(Date.now())+100*1000);
            let r = await vfs.writeFile(dataStream(["foo","\n"]), {...props, user_id: 0});
            r = await expect(run(`UPDATE files SET ctime = $time WHERE file_id = $id`, {$id: r.id, $time: mtime.toISOString()})).to.be.fulfilled;
            expect(r).to.have.property("changes", 1);
            r = await expect(vfs.getFileProps(props)).to.be.fulfilled;
            expect(r.ctime.valueOf()).to.equal(ctime.valueOf());
            expect(r.mtime.valueOf()).to.equal(mtime.valueOf());
          });

          it("can use a scene ID", async function(){
            let r = await expect(vfs.getFileProps({...props, scene: scene_id})).to.be.fulfilled;
            expect(r).to.have.property("name", props.name);
          })

          it("throw 404 error if file doesn't exist", async function(){
            await expect(vfs.getFileProps({...props, name: "bar.html"})).to.be.rejectedWith("404");
          });

          it("get archived file", async function(){
            let id = await vfs.removeFile({...props, user_id: 0});
            await expect(vfs.getFileProps(props), `File with id ${id} shouldn't be returned`).to.be.rejectedWith("[404]");
            await expect(vfs.getFileProps({...props, archive: true})).to.eventually.have.property("id", id);
          });

          it("get by generation", async function(){
            let r = await vfs.writeFile(dataStream(["foo","\n"]), {...props, user_id: 0});
            expect(r).to.have.property("generation", 2);
            await expect(vfs.getFileProps({...props, generation: 2})).to.eventually.have.property("generation", 2);
            await expect(vfs.getFileProps({...props, generation: 1})).to.eventually.have.property("generation", 1);
          });

          it("get archived by generation", async function(){
            await vfs.writeFile(dataStream(["foo","\n"]), {...props, user_id: 0});
            let id = await vfs.removeFile({...props, user_id: 0});
            await expect(vfs.getFileProps({...props, archive: true, generation: 3})).to.eventually.have.property("id", id);
            await expect(vfs.getFileProps({...props, archive: true, generation: 3}, true)).to.eventually.have.property("id", id);
          });
          
          it("get document", async function(){
            let {ctime:docCtime, ...doc} = await vfs.writeDoc("{}", {...props, user_id: 0});
            await expect(vfs.getFileProps({...props, archive: true, generation: doc.generation}, true)).to.eventually.deep.equal({...doc, ctime, data: "{}"});
          });
        });

        describe("getFile()", function(){
          it("get a file", async function(){
            let {stream} = await vfs.getFile(props);
            let str = "";
            for await (let d of stream!){
              str += d.toString("utf8");
            }
            expect(str).to.equal("foo\n");
          });

          it("get a document", async function(){
            //getFile can sometimes be used to get a stream to an existing document. Its shouldn't care and do it.
            await vfs.writeDoc("Hello World\n", {...props, user_id: 0});
            let {stream} = await vfs.getFile(props);
            let str = "";
            for await (let d of stream!){
              expect(Buffer.isBuffer(d), `chunk is a ${typeof d}. Expected a buffer`).to.be.true;
              str += d.toString("utf8");
            }
            expect(str).to.equal("Hello World\n");
          });

          it("get a range of a document", async function(){
            await vfs.writeDoc("Hello World\n", {...props, user_id: 0});
            let start = 3;
            let end = 7;
            let {stream} = await vfs.getFile({...props,start,end});
            let str = "";
            for await (let d of stream!){
              expect(Buffer.isBuffer(d), `chunk is a ${typeof d}. Expected a buffer`).to.be.true;
              str += d.toString("utf8");
            }
            expect(str).to.equal("lo W");
          });


          it("get a document range of a document with NO end", async function(){
            await vfs.writeDoc("Hello World\n", {...props, user_id: 0});
            let start = 3;
            let {stream} = await vfs.getFile({...props,start});
            let str = "";
            for await (let d of stream!){
              expect(Buffer.isBuffer(d), `chunk is a ${typeof d}. Expected a buffer`).to.be.true;
              str += d.toString("utf8");
            }
            expect(str).to.equal("lo World\n");
          });

        
          it("get a document of a document with NO start", async function(){
            await vfs.writeDoc("Hello World\n", {...props, user_id: 0});
            let end = 3;
            let {stream} = await vfs.getFile({...props,end});
            let str = "";
            for await (let d of stream!){
              expect(Buffer.isBuffer(d), `chunk is a ${typeof d}. Expected a buffer`).to.be.true;
              str += d.toString("utf8");
            }
            expect(str).to.equal("Hel");
          });


          it("get a document with end after end of file", async function(){
            await vfs.writeDoc("Hello World\n", {...props, user_id: 0});
            let start = 3;
            let end = 100;
            let {stream} = await vfs.getFile({...props,start,end});
            let str = "";
            for await (let d of stream!){
              expect(Buffer.isBuffer(d), `chunk is a ${typeof d}. Expected a buffer`).to.be.true;
              str += d.toString("utf8");
            }
            expect(str).to.equal("lo World\n");
          });

          it("get a document with start after end of file", async function(){
            await vfs.writeDoc("Hello World\n", {...props, user_id: 0});
            let start = 50;            //getFile can sometimes be used to get a stream to an existing document. Its shouldn't care and do it.

            let end = 100;
            let {stream} = await vfs.getFile({...props,start,end});
            let str = "";
            for await (let d of stream!){
              expect(Buffer.isBuffer(d), `chunk is a ${typeof d}. Expected a buffer`).to.be.true;
              str += d.toString("utf8");
            }
            expect(str).to.equal("");
          });

          it("get a range of bytes of a document with start and end", async function(){
            // getFile can get start and end properties to read parts of a file 
            let start = 1;
            let end = 3;
            let {stream} = await vfs.getFile({...props, start, end});
            let str = "";
            for await (let d of stream!){
              expect(Buffer.isBuffer(d), `chunk is a ${typeof d}. Expected a buffer`).to.be.true;
              str += d.toString("utf8");
            }
            expect(str.length).to.equal(end-start);
            expect(str).to.equal("oo");
          });

          it("get a range of bytes of a document with start and NO end", async function(){
            // When getting only a start, getFile goes from start property to end of the file
            let start = 1;
            let {stream} = await vfs.getFile({...props, start});
            let str = "";
            for await (let d of stream!){
              expect(Buffer.isBuffer(d), `chunk is a ${typeof d}. Expected a buffer`).to.be.true;
              str += d.toString("utf8");
            }
            expect(str.length).to.equal("foo\n".length-start);
            expect(str).to.equal("oo\n");
          });

          it("get a range of bytes of a document with NO start and end", async function(){
            // When getting only an end, getFile goes from the start of the file to end property
            let end = 2;
            let {stream} = await vfs.getFile({...props, end});
            let str = "";
            for await (let d of stream!){
              expect(Buffer.isBuffer(d), `chunk is a ${typeof d}. Expected a buffer`).to.be.true;
              str += d.toString("utf8");
            }
            expect(str.length).to.equal(end);
            expect(str).to.equal("fo");
          });


          it("get a range of bytes of a document with end after end of file", async function(){
            let start = 1;
            let end = 50;
            let {stream} = await vfs.getFile({...props, start, end});
            let str = "";
            for await (let d of stream!){
              expect(Buffer.isBuffer(d), `chunk is a ${typeof d}. Expected a buffer`).to.be.true;
              str += d.toString("utf8");
            }
            expect(str).to.equal("oo\n");
          });

          it("get a range of bytes of a document with start after end of file", async function(){
            let start = 20;
            let end = 50;
            let {stream} = await vfs.getFile({...props, start, end});
            let str = "";
            for await (let d of stream!){
              expect(Buffer.isBuffer(d), `chunk is a ${typeof d}. Expected a buffer`).to.be.true;
              str += d.toString("utf8");
            }
            expect(str).to.equal("");
          });


          it("throw 404 error if file doesn't exist", async function(){
            await expect(vfs.getFile({...props, name: "bar.html"})).to.be.rejectedWith("404");
          });

          it("won't try to open a folder, just returns props", async function(){
            let file = await expect(vfs.getFile({scene: props.scene, name: "articles"})).to.be.fulfilled;
            expect(file).to.have.property("mime", "text/directory");
            expect(file).to.not.have.property("stream");
          });
        });
  
        describe("getFileHistory()", function(){
          it("get previous versions of a file", async function(){
            let r2 = await vfs.writeFile(dataStream(["foo2","\n"]), {...props, user_id: 0} );
            let r3 = await vfs.writeFile(dataStream(["foo3","\n"]), {...props, user_id: 0} );
            await vfs.writeFile(dataStream(["bar","\n"]), {...props, name:"bar", user_id: 0} ); //another file
            let versions = await vfs.getFileHistory(props);
            let fileProps = await vfs.getFileProps(props);
            //Expect reverse order
            expect(versions.map(v=>v.generation)).to.deep.equal([3, 2, 1]);
            versions.forEach((version, i)=>{
              expect(Object.keys(version).sort(),`Bad file properties at index ${i}`).to.deep.equal(Object.keys(fileProps).sort())
            });
          });
          it("works using a scene's name", async function(){
            await expect(vfs.getFileHistory({...props, scene: "foo"})).to.be.fulfilled;
          });
          it("throw a 404 if file doesn't exist", async function(){
            await expect(vfs.getFileHistory({...props, name: "missing"})).to.be.rejectedWith("404");
          });
          it("throw a 404 if scene doesn't exist (by name)", async function(){
            await expect(vfs.getFileHistory({...props, scene: "missing"})).to.be.rejectedWith("404");
          });
          it("throw a 404 if scene doesn't exist (by id)", async function(){
            await expect(vfs.getFileHistory({...props, scene: scene_id+1})).to.be.rejectedWith("404");
          });
        });

        describe("removeFile()", function(){
          it("add an entry with state = REMOVED", async function(){
            await vfs.removeFile({...props, user_id: 0});
            let files = await all(`SELECT * FROM files WHERE name = "${props.name}"`);
            expect(files).to.have.property("length", 2);
            expect(files[0]).to.include({
              hash: "tbudgBSg-bHWHiHnlteNzN8TUvI80ygS9IULh4rklEw",
              generation: 1
            });
            expect(files[1]).to.include({
              hash: null,
              generation: 2
            });
          });
          it("requires the file to actually exist", async function(){
            await expect(vfs.removeFile({...props, name: "bar.txt", user_id: 0})).to.be.rejectedWith("404");
          });
          it("require file to be in active state", async function(){
            await expect(vfs.removeFile({...props, user_id: 0})).to.be.fulfilled,
            await expect(vfs.removeFile({...props, user_id: 0})).to.be.rejectedWith("already deleted");
          });
        });
  
        describe("renameFile()", function(){
  
          it("rename a file", async function(){
            await vfs.renameFile({...props, user_id: 0}, "bar.txt");
            await expect(vfs.getFileProps(props), "old file should not be reported anymore").to.be.rejectedWith("404");
            let file = await expect(vfs.getFileProps({...props, name: "bar.txt"})).to.be.fulfilled;
            expect(file).to.have.property("mime", "text/html");
          });
          
          it("throw 404 error if file doesn't exist", async function(){
            await expect(vfs.renameFile({...props, user_id: 0, name: "bar.html"}, "baz.html")).to.be.rejectedWith("404");
          });
  
          it("file can be created back after rename", async function(){
            await vfs.renameFile({...props, user_id: 0}, "bar.txt");
            await vfs.writeFile(dataStream(["foo","\n"]), {...props, user_id: 0} );
            await expect(vfs.getFileProps({...props, name: "bar.txt"})).to.be.fulfilled;
            //Check if it doesn't mess with the history
            let hist = await vfs.getFileHistory(props);
            expect(hist.map(f=>f.hash)).to.deep.equal([
              "tbudgBSg-bHWHiHnlteNzN8TUvI80ygS9IULh4rklEw",
              null,
              "tbudgBSg-bHWHiHnlteNzN8TUvI80ygS9IULh4rklEw"
            ]);
          });
          it("can move to a deleted file", async function(){
            await vfs.renameFile({...props, user_id: 0}, "bar.txt");
            //move it back in place after it was deleted
            await vfs.renameFile({...props, name: "bar.txt", user_id: 0}, props.name);
            let hist = await vfs.getFileHistory(props);
            expect(hist.map(f=>`${f.name}#${f.generation}: ${f.hash}`)).to.deep.equal([
              `articles/foo.txt#3: tbudgBSg-bHWHiHnlteNzN8TUvI80ygS9IULh4rklEw`,
              `articles/foo.txt#2: null`,
              `articles/foo.txt#1: tbudgBSg-bHWHiHnlteNzN8TUvI80ygS9IULh4rklEw`
            ]);
            await expect(vfs.getFile({...props, name: "bar.txt"})).to.be.rejectedWith(NotFoundError);
          });
          it("can move in a folder", async function(){
            await vfs.renameFile({...props, user_id: 0}, "articles/bar.txt");
            await expect(vfs.getFileProps(props)).to.be.rejectedWith(NotFoundError);
            expect(await vfs.getFileProps({...props, name: "articles/bar.txt"})).to.have.property("hash", "tbudgBSg-bHWHiHnlteNzN8TUvI80ygS9IULh4rklEw");
          });

          it("can move a document", async function(){
            const props =  {scene: scene_id, user_id: 0, name:"foo.json", mime: "application/json"};
            let doc = await vfs.writeDoc("{}",props);
            expect(doc).to.have.property("hash").ok;
            await expect(vfs.renameFile(props, "bar.json")).to.be.fulfilled; 
            expect(await vfs.getFileProps({...props, name: "bar.json"})).to.have.property("hash", doc.hash);
          });
        });
      })
      

      describe("writeDoc()", function(){
        it("insert a new document using scene_id", async function(){
          await vfs.writeDoc("{}", {scene: scene_id, user_id: 0, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
          await expect(all(`SELECT * FROM files WHERE name = "scene.svx.json"`)).to.eventually.have.property("length", 1);
        })
        it("insert a new document using scene_name", async function(){
          await vfs.writeDoc("{}", {scene: "foo", user_id: 0, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
          await expect(all(`SELECT * FROM files  WHERE name = "scene.svx.json"`)).to.eventually.have.property("length", 1);
        })
        it("requires a scene to exist", async function(){
          await expect(vfs.writeDoc("{}", {scene: 125 /*arbitrary non-existent scene id */, user_id: 0, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"})).to.be.rejectedWith("404");
          await expect(all(`SELECT * FROM files WHERE fk_scene_id = 125`)).to.eventually.have.property("length", 0);
        });
        it("can provide an author", async function(){
          let {user_id} = await get(`INSERT INTO users ( username ) VALUES ("alice") RETURNING printf("%x", user_id) AS user_id`);
          await expect(vfs.writeDoc("{}",  {scene: scene_id, user_id: user_id, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"})).to.be.fulfilled;
          let files = await all(`SELECT data, printf("%x", fk_author_id) as fk_author_id FROM files WHERE name = "scene.svx.json"`);
          expect(files).to.have.length(1);
          expect(files[0]).to.deep.equal({
            data: "{}",
            fk_author_id: user_id,
          });
        });
        it("updates scene's current doc", async function(){
          for(let i = 1; i<=3; i++){
            let id = (await vfs.writeDoc(`{"i":${i}}`, {scene: scene_id, user_id: 0, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"})).id;
            await expect(vfs.getDoc(scene_id)).to.eventually.deep.include({id});
          }
        });
      });

      
      describe("getScene()", function(){
        this.beforeEach(async function(){
          await vfs.writeDoc("{}", {scene: scene_id, user_id: 0, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
        });

        it("throw an error if not found", async function(){
          await expect(vfs.getScene("bar")).to.be.rejectedWith("scene_name");
        });

        it("get a valid scene", async function(){
          let scene = await vfs.getScene("foo");

          let props = sceneProps(scene_id);
          let key:keyof Scene;
          for(key in props){
            if(typeof props[key] ==="undefined"){
              expect(scene, `${(scene as any)[key]}`).not.to.have.property(key);
            }else if(typeof props[key] === "function"){
              expect(scene).to.have.property(key).instanceof(props[key]);
            }else{
              expect(scene).to.have.property(key).to.deep.equal(props[key]);
            }
          }
        });

        it("get an empty scene", async function(){
          let id = await vfs.createScene("empty");
          let scene = await vfs.getScene("empty");
          expect(scene).to.have.property("ctime").instanceof(Date);
          expect(scene).to.have.property("mtime").instanceof(Date);
          expect(scene).to.have.property("id", id).a("number");
          expect(scene).to.have.property("name", "empty");
          expect(scene).to.have.property("author", "default");
        });

        it("get a scene's thumbnail if it exist (jpg)", async function(){
          await vfs.writeDoc("\n", {scene: scene_id, user_id: 0, name: "scene-image-thumb.jpg", mime: "image/jpeg"});
          let s = await vfs.getScene(scene_id);
          expect(s).to.have.property("thumb", "scene-image-thumb.jpg");
        });

        it("get a scene's thumbnail if it exist (png)", async function(){
          await vfs.writeDoc("\n", {scene: scene_id, user_id: 0, name: "scene-image-thumb.png", mime: "image/png"});
          let s = await vfs.getScene(scene_id);
          expect(s).to.have.property("thumb", "scene-image-thumb.png");
        });

        it("get a scene's thumbnail if it exist (prioritized)", async function(){
          let times = [
            new Date("2022-01-01"),
            new Date("2023-01-01"),
            new Date("2024-01-01")
          ];
          const setDate = (i:number, d:Date)=>vfs._db.run(`UPDATE files SET ctime = $time WHERE file_id = $id`, {$id: i, $time: d});
          let png = await vfs.writeDoc("\n", {scene: scene_id, user_id: 0, name: "scene-image-thumb.png", mime: "image/png"});
          let jpg = await vfs.writeDoc("\n", {scene: scene_id, user_id: 0, name: "scene-image-thumb.jpg", mime: "image/jpeg"});

          let r = await setDate(jpg.id, times[1]);
          await setDate(png.id, times[2]);
          let s = await vfs.getScene(scene_id);
          expect(s, `use PNG thumbnail if it's the most recent`).to.have.property("thumb", "scene-image-thumb.png");

          await setDate(png.id, times[0]);
          s = await vfs.getScene(scene_id);
          expect(s, `use JPG thumbnail if it's the most recent`).to.have.property("thumb", "scene-image-thumb.jpg");

          //If date is equal, prioritize jpg
          await setDate(png.id, times[1]);
          s = await vfs.getScene(scene_id);
          expect(s, `With equal dates, alphanumeric order shopuld prioritize JPG over PNG file`).to.have.property("thumb", "scene-image-thumb.jpg");
        });

        it("get requester's access right", async function(){
          let userManager = new UserManager(vfs._db);
          let alice = await userManager.addUser("alice", "xxxxxxxx", false);

          let id = await vfs.createScene("alice's", alice.uid);
          await vfs.writeDoc("{}", {scene: id, user_id: alice.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
          let scene = await vfs.getScene("alice's", alice.uid);
          expect(scene).to.have.property("access").to.have.property("user").to.equal("admin");
        });
        it("performs requests for default user", async function(){
          let scene = await vfs.getScene("foo", 0);
          expect(scene).to.be.ok;
        })
      });

      describe("getSceneHistory()", function(){
        let default_folders = 2
        describe("get an ordered history", function(){
          this.beforeEach(async function(){
            let fileProps :WriteFileParams = {user_id: 0, scene:scene_id, mime: "model/gltf-binary", name:"models/foo.glb"}
            await vfs.writeFile(dataStream(), fileProps);
            await vfs.writeDoc("{}", {scene: scene_id, user_id: 0, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
            await vfs.writeFile(dataStream(), fileProps);
            await vfs.writeDoc("{}", {scene: scene_id, user_id: 0, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
          });

          it("all events", async function(){
            let history = await vfs.getSceneHistory(scene_id);
            expect(history).to.have.property("length", 4 + default_folders);
            //Couln't easily test ctime sort
            expect(history.map(e=>e.name)).to.deep.equal([
              "scene.svx.json",
              "scene.svx.json",
              "models/foo.glb",
              "models/foo.glb",
              "models",
              "articles",
            ]);
            expect(history.map(e=>e.generation)).to.deep.equal([2,1,2,1,1,1]);
          });
          
          it("with limit", async function(){
            let history = await vfs.getSceneHistory(scene_id, {limit: 1});
            expect(history).to.have.property("length", 1);
            //Couln't easily test ctime sort
            expect(history.map(e=>e.name)).to.deep.equal([
              "scene.svx.json",
            ]);
            expect(history.map(e=>e.generation)).to.deep.equal([2]);
          });
          it("with offset", async function(){
            let history = await vfs.getSceneHistory(scene_id, {limit: 2, offset: 1});
            expect(history).to.have.property("length", 2);
            //Couln't easily test ctime sort
            expect(history.map(e=>e.name)).to.deep.equal([
              "scene.svx.json",
              "models/foo.glb",
            ]);
            expect(history.map(e=>e.generation)).to.deep.equal([1,2]);
          });
        });

        it("reports proper size for data strings", async function(){
          //By default sqlite counts string length as char length and not byte length
          let str = `{"id":"你好"}`;
          expect(str.length).not.to.equal(Buffer.byteLength(str));
          await vfs.writeDoc(str, {scene: scene_id, user_id: 0, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
          let history = await vfs.getSceneHistory(scene_id);
          expect(history).to.have.property("length", 1+ default_folders);
          expect(history.find(f=>f.name == "scene.svx.json")).to.have.property("size", Buffer.byteLength(str));
        });

        it("supports pagination", async function(){
          for(let i=0; i < 20; i++){
            await vfs.writeDoc("{}", {scene: scene_id, user_id: 0, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
          }

          let history = await vfs.getSceneHistory(scene_id, {limit: 2, offset: 0});
          expect(history.map(e=>e.generation)).to.deep.equal([
            20,
            19,
          ]);
          history = await vfs.getSceneHistory(scene_id, {limit: 2, offset: 2});
          expect(history).to.have.property("length", 2);
          expect(history.map(e=>e.generation)).to.deep.equal([
            18,
            17,
          ]);
        });
      });

      describe("listFiles()", function(){
        let tref = new Date("2022-12-08T10:49:46.196Z");

        it("Get files created for a scene", async function(){
          let f1 = await vfs.writeFile(dataStream(), {user_id: 0, scene:"foo", mime: "model/gltf-binary", name:"models/foo.glb"});
          let f2 = await vfs.writeFile(dataStream(), {user_id: 0, scene:"foo",  mime: "image/jpeg", name:"foo.jpg"});
          let d1 = await vfs.writeDoc('{}', {user_id: 0, scene: "foo", mime: "application/si-dpo-3d.document+json", name: "scene.svx.json"});
          await run(`UPDATE files SET ctime = $t`, {$t:tref.toISOString()});
          let files = await collapseAsync(vfs.listFiles(scene_id));
          expect(files).to.deep.equal([
            {
              size: 4,
              hash: 'tbudgBSg-bHWHiHnlteNzN8TUvI80ygS9IULh4rklEw',
              generation: 1,
              id: f2.id,
              name: 'foo.jpg',
              mime: "image/jpeg",
              ctime: tref,
              mtime: tref,
              author_id: 0,
              author: "default",
            },{
              size: 4,
              hash: 'tbudgBSg-bHWHiHnlteNzN8TUvI80ygS9IULh4rklEw',
              generation: 1,
              id: f1.id,
              name: 'models/foo.glb',
              mime: "model/gltf-binary",
              ctime: tref,
              mtime: tref,
              author_id: 0,
              author: "default",
            },
            {
              size: 2,
              hash: "RBNvo1WzZ4oRRq0W9-hknpT7T8If536DEMBg9hyq_4o",
              generation: 1,
              id: d1.id,
              mime: "application/si-dpo-3d.document+json",
              name: "scene.svx.json",
              ctime: tref,
              mtime: tref,
              author_id: 0,
              author: "default",
            }
          ]);
        });

        it("Groups files versions", async function(){
          let tnext = new Date(tref.getTime()+8000);
          let originalFiles = (await all("SELECT * FROM files")).length
          let f1 = await vfs.writeFile(dataStream(["foo", "\n"]), {user_id: 0, scene:"foo",  mime: "model/gltf-binary", name:"models/foo.glb"});
          let del = await  vfs.createFile({user_id: 0, scene:"foo", mime: "model/gltf-binary", name:"models/foo.glb"}, {hash: null, size: 0});
          let f2 = await vfs.writeFile(dataStream(["hello world", "\n"]), {user_id: 0, scene:"foo", mime: "model/gltf-binary", name:"models/foo.glb"});
          await expect(all("SELECT * FROM files")).to.eventually.have.property("length", 3+originalFiles);
          await run(`UPDATE files SET ctime = $t WHERE file_id = $id`, {$t:tref.toISOString(), $id:f1.id});
          await run(`UPDATE files SET ctime = $t WHERE file_id = $id`, {$t:tref.toISOString(), $id:del.id});
          await run(`UPDATE files SET ctime = $t WHERE file_id = $id`, {$t:tnext.toISOString(), $id:f2.id});

          let files = await collapseAsync(vfs.listFiles(scene_id));
          expect(files).to.have.property("length", 1);
          expect(files).to.deep.equal([{
            size: 12,
            hash: 'qUiQTy8PR5uPgZdpSzAYSw0u0cHNKh7A-4XSmaGSpEc',
            generation: 3,
            id: f2.id,
            name: 'models/foo.glb',
            mime: "model/gltf-binary",
            ctime: tref,
            mtime: tnext,
            author_id: 0,
            author: "default",
          }]);
        });

        it("returns only files that are not removed", async function(){
          let props :WriteFileParams = {user_id: 0, scene:"foo", mime: "model/gltf-binary", name:"models/foo.glb"}
          let f1 = await vfs.writeFile(dataStream(), props);
          await vfs.removeFile(props);
          let files = await collapseAsync(vfs.listFiles(scene_id));
          expect(files).to.have.property("length", 0);
        });

        it("can get a list of archived files", async function(){
          await vfs.writeFile(dataStream(["foo", "\n"]), {user_id: 0, scene: scene_id, mime: "text/html", name:"articles/hello.txt"});
          let del = await  vfs.createFile({user_id: 0, scene: scene_id, name:"articles/hello.txt"}, {hash: null, size: 0});

          let files = await collapseAsync(vfs.listFiles(scene_id, {withArchives: true}));
          expect(files).to.have.property("length", 1);
          expect(files[0]).to.have.property("hash", null);
          expect(files[0]).to.have.property("id", del.id);
        });

        it("can get file data", async function(){
          await vfs.writeDoc(`{"foo":"bar"}`, {user_id: 0, scene: scene_id, mime: "text/html", name: "foo.txt"});
          let files = await collapseAsync(vfs.listFiles(scene_id, {withData: true}));
          expect(files).to.have.property("length", 1);
          expect(files[0]).to.have.property("data", `{"foo":"bar"}`);
        });
      });
      
      describe("getDoc()", function(){
        it("throw if not found", async function(){
          await expect(vfs.getDoc(scene_id)).to.be.rejectedWith("[404]");
        });
        it("fetch currently active document", async function(){
          let id = (await vfs.writeDoc("{}", {scene: scene_id, user_id: 0, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"})).id;
          let doc = await expect(vfs.getDoc(scene_id)).to.be.fulfilled;
          expect(doc).to.have.property("id", id);
          expect(doc).to.have.property("ctime").instanceof(Date);
          expect(doc).to.have.property("mtime").instanceof(Date);
          expect(doc).to.have.property("author_id", 0);
          expect(doc).to.have.property("author", "default");
          expect(doc).to.have.property("data", "{}");
          expect(doc).to.have.property("generation", 1);
        });
      });
    });
  });
});

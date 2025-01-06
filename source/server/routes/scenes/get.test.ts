import fs from "fs/promises";
import yauzl, { Entry, ZipFile } from "yauzl";

import request from "supertest";
import { expect } from "chai";
import User from "../../auth/User.js";
import UserManager from "../../auth/UserManager.js";
import Vfs from "../../vfs/index.js";
import path from "path";
import { tmpdir } from "os";
import { execFile } from "child_process";
import { once } from "events";




describe("GET /scenes", function(){

  let vfs:Vfs, userManager:UserManager, ids :number[], user :User, admin :User;
  this.beforeAll(async function(){
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager  = locals.userManager;

    
    user = await userManager.addUser("bob", "12345678", false);
    admin = await userManager.addUser("alice", "12345678", true);

    ids = await Promise.all([
        vfs.createScene("foo"),
        vfs.createScene("bar"),
    ]);
  });
  this.afterAll(async function(){
    await vfs.close();
    await fs.rm(this.dir, {recursive: true});
  });

  it("returns a list of scene names as text", async function(){
    let r = await request(this.server).get("/scenes")
    .set("Accept", "text/plain")
    .expect(200);
    expect(r.text).to.equal(`bar\nfoo\n`);
  });

  it("defaults to JSON with full data", async function(){
    let r = await request(this.server).get("/scenes")
    .expect(200)
    .expect("Content-Type", "application/json; charset=utf-8");
    expect(r.body).to.have.property("scenes").to.have.property("length", 2);
  });
  
  it("can send a zip file", async function(){
    await vfs.writeDoc(`{"hello": "world"}`, {scene: "foo", name: "scene.svx.json", user_id: 0});
    let res = await request(this.server).get("/scenes")
    .set("Accept", "application/zip")
    .responseType('blob')
    .expect(200)
    .expect("Content-Type", "application/zip");

    let b :any = res.body;
    expect(b).to.be.instanceof(Buffer);
    expect(b).to.have.property("length").above(0);
    let zip = await new Promise<ZipFile>((resolve, reject)=>yauzl.fromBuffer(b, (err:Error|null, zip:ZipFile)=> err?reject(err):resolve(zip)));
    let entries :Entry[] = [];
    zip.on("entry", (e)=>entries.push(e));
    await once(zip, "end");
    expect(entries).to.have.property("length", 1);
  });
  
  it("returned zip file is valid", async function(){
    await vfs.writeDoc(`{"hello": "world"}`, {scene: "foo", name: "scene.svx.json", user_id: 0});
    await vfs.writeFile(dataStream(["hello world \n"]), {scene: "bar", name: "articles/hello.html", user_id: 0});
    
    let res = await request(this.server).get("/scenes")
    .set("Accept", "application/zip")
    .responseType('blob')
    .expect(200)
    .expect("Content-Type", "application/zip");

    let b :any = res.body;
    expect(b).to.be.instanceof(Buffer);
    expect(b).to.have.property("length").above(0);


    let outdir = await fs.mkdtemp(path.join(this.dir, "eCorpus-zip-file-test"));
    let file = path.join(outdir, "test.zip");
    await fs.writeFile(file, b);
    await expect(new Promise<void>((resolve, reject)=>{
      execFile("unzip", ["-t", file], (error, stdout, stderr)=>{
        if(error) reject(error);
        else resolve();
      });
    })).to.be.fulfilled;
  })

  describe("can get a list of scenes", function(){
    let scenes:number[];
    this.beforeAll(async ()=>{
      scenes = await Promise.all([
        vfs.createScene("s1"),
        vfs.createScene("s2"),
      ]);
    });
    this.afterAll(async function(){
      await Promise.all(scenes.map(id=>vfs.removeScene(id)));
    });

    it("by name", async function(){
      let r = await request(this.server).get("/scenes?name=s1&name=s2")
      .set("Accept", "application/json")
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");
      expect(r.body).to.have.property("scenes").to.have.property("length", 2);
    });
    
    it("by ids", async function(){
      let r = await request(this.server).get(`/scenes?${scenes.map(id=>`id=${id}`).join("&")}`)
      .set("Accept", "application/json")
      .send({scenes: scenes})
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");
      expect(r.body).to.have.property("scenes").to.have.property("length", 2);
    });
  });

  describe("can search scenes", async function(){
    let scenes:number[];
    this.beforeAll(async ()=>{
      scenes = await Promise.all([
        vfs.createScene("read", {[`${user.uid}`]:"read"}),
        vfs.createScene("write", {[`${user.uid}`]:"write"}),
        await vfs.createScene("admin", {[`${user.uid}`]:"admin"}),
      ]);
    });

    this.afterAll(async function(){
      await Promise.all(scenes.map(id=>vfs.removeScene(id)));
    });


    it("search by access level", async function(){
      let scene :any = await vfs.getScene("write", user.uid);
      delete scene.thumb;

      let r = await request(this.server).get(`/scenes?access=write`)
      .auth(user.username, "12345678")
      .set("Accept", "application/json")
      .send({scenes: scenes})
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");
      expect(r.body.scenes).to.deep.equal([
        {
          ...scene,
          mtime: scene.mtime.toISOString(),
          ctime: scene.ctime.toISOString()
        },
      ]);
    });

    it("search by multiple access levels", async function(){

      let s1 :any = await vfs.getScene("write", user.uid);
      let s2 :any = await vfs.getScene("admin", user.uid);

      delete s1.thumb;
      delete s2.thumb;

      let r = await request(this.server).get(`/scenes?access=write&access=admin`)
      .auth(user.username, "12345678")
      .set("Accept", "application/json")
      .send({scenes: scenes})
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");
      expect(r.body.scenes).to.deep.equal([
        {
          ...s2,
          mtime: s2.mtime.toISOString(),
          ctime: s2.ctime.toISOString()
        },{
          ...s1,
          mtime: s1.mtime.toISOString(),
          ctime: s1.ctime.toISOString()
        },
      ]);

    })

    it("search by name match", async function(){
      let scenes = (await Promise.all([
        vfs.getScene("read", user.uid),
        vfs.getScene("write", user.uid),
      ])).map(({thumb, mtime, ctime, ...s})=>({
        ...s,
        mtime: mtime.toISOString(),
        ctime: ctime.toISOString()
      }));
      let r = await request(this.server).get(`/scenes?match=e`)
      .auth(user.username, "12345678")
      .set("Accept", "application/json")
      .send({scenes: scenes})
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");
      expect(r.body.scenes).to.deep.equal(scenes);
    });
  });

  describe("supports pagination", function(){
    let scenes:number[] = [];

    this.beforeAll(async ()=>{
      for(let i = 0; i < 110; i++){
        scenes.push(await vfs.createScene(`scene_${i.toString(10).padStart(3, "0")}`));
      }
    });
    
    this.afterAll(async function(){
      await Promise.all(scenes.map(id=>vfs.removeScene(id)));
    });

    it("use default limit", async function(){
      let r = await request(this.server).get(`/scenes`)
      .set("Accept", "application/json")
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");
      expect(r.body).to.have.property("scenes").to.have.property("length", 10);
    });

    it("use custom limit and offset", async function(){
      let r = await request(this.server).get(`/scenes?limit=12&offset=12&match=scene_`)
      .set("Accept", "application/json")
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");
      expect(r.body).to.have.property("scenes").to.have.property("length", 12);
      expect(r.body.scenes[0]).to.have.property("name", "scene_012");
    });
  });

  describe("archives", async function(){
    let scenes:number[];
    this.beforeAll(async ()=>{
      scenes = [];
      scenes.push(await vfs.createScene(`scene_archived`));
      await vfs.archiveScene("scene_archived");
      scenes.push(await vfs.createScene(`scene_live`));
    });
    
    this.afterAll(async function(){
      await Promise.all(scenes.map(id=>vfs.removeScene(id)));
    });

    it("can get only archived scenes", async function(){
      let r = await request(this.server).get("/scenes?access=none")
      .auth(admin.username, "12345678")
      .expect(200);
      let names = r.body.scenes.map((s:any)=>s.name)
      expect(names).to.include(`scene_archived#${scenes[0].toString(10)}`);
    });

    it

    it("requires global admin rights", async function(){
      let r = await request(this.server).get("/scenes?access=none")
      .auth(user.username, "12345678")
      .expect(200);
      expect(r.body).to.have.property("scenes").to.have.length(0);
    });

    it("won't return archived scenes in a default query", async function(){
      let r = await request(this.server).get("/scenes")
      .auth(user.username, "12345678")
      .expect(200);
      let names = r.body.scenes.map((s:any)=>s.name)
      expect(names).not.to.include(`scene_archived#${scenes[0].toString(10)}`);
    });

  })

});

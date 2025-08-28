import {ClientRequest} from "http"
import {once} from "events";
import {Readable} from "stream";
import timers from "node:timers/promises";

import request from "supertest";
import UserManager from "../../../../../auth/UserManager.js";
import User, { UserLevels } from "../../../../../auth/User.js";
import Vfs from "../../../../../vfs/index.js";




describe("GET /scenes/:scene/:filename(.*)", function(){
  
  let vfs :Vfs, userManager :UserManager, user :User, admin :User;

  this.beforeEach(async function(){
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager = locals.userManager;
    user = await userManager.addUser("bob", "12345678");
    admin = await userManager.addUser("alice", "12345678", "admin");

  });
  this.afterEach(async function(){
    await cleanIntegrationContext(this);
  });

  it("can get a public scene's file", async function(){
    let scene_id = await vfs.createScene("foo").then((scene_id)=> {userManager.setPublicAccess(scene_id,"read"); return scene_id});
    await vfs.writeDoc("{}", {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
    await vfs.writeFile(dataStream(), {scene: "foo", mime:"model/gltf-binary", name: "models/foo.glb", user_id: user.uid});

    await request(this.server).get("/scenes/foo/models/foo.glb")
    .expect(200)
    .expect("Content-Type", "model/gltf-binary")
    .expect("foo\n");
  });

  it("can't get a private scene's file (obfuscated as 404)", async function(){
    let scene_id = await vfs.createScene("foo").then((scene_id)=> 
      {userManager.setDefaultAccess(scene_id, "none");
      userManager.setPublicAccess(scene_id, "none");
      userManager.grant(scene_id, user.uid, "admin");
      return scene_id}); 
    await vfs.writeDoc("{}", {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
    await vfs.writeFile(dataStream(), {scene: "foo", mime:"model/gltf-binary", name: "models/foo.glb", user_id: user.uid});
    await request(this.server).get("/scenes/foo/models/foo.glb")
    .expect(404);
  });

  it("can get an owned scene's file", async function(){
    let scene_id = await vfs.createScene("foo").then((scene_id)=> 
      {userManager.setPublicAccess(scene_id, "none");
      userManager.grant(scene_id, user.uid, "admin");
      return scene_id});
    await vfs.writeDoc("{}", {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
    await vfs.writeFile(dataStream(), {scene: "foo", mime:"model/gltf-binary", name: "models/foo.glb", user_id: user.uid});
    let agent = request.agent(this.server);
    await agent.post("/auth/login")
    .send({username: user.username, password: "12345678"})
    .set("Content-Type", "application/json")
    .set("Accept", "")
    .expect(200)
    .expect('set-cookie', /session=/);

    await agent.get("/scenes/foo/models/foo.glb")
    .expect(200)
    .expect("Content-Type", "model/gltf-binary")
    .expect("foo\n");
  });

  it("is case-sensitive", async function(){
    let scene_id = await vfs.createScene("foo").then((scene_id)=> 
      {userManager.setPublicAccess(scene_id, "read");
      userManager.grant(scene_id, user.uid, "admin");
      return scene_id});
    await vfs.writeDoc("{}", {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
    await vfs.writeFile(dataStream(), {scene: "foo", mime:"model/gltf-binary", name: "models/foo.glb", user_id: user.uid});
    await vfs.writeFile(dataStream(["FOO\n"]), {scene: "foo", mime:"model/gltf-binary", name: "models/FOO.GLB", user_id: user.uid});


    await request(this.server).get("/scenes/foo/models/FOO.GLB")
    .expect(200)
    .expect("Content-Type", "model/gltf-binary")
    .expect("FOO\n");


    await request(this.server).get("/scenes/foo/models/foo.glb")
    .expect(200)
    .expect("Content-Type", "model/gltf-binary")
    .expect("foo\n");
  });

  it.skip("can abort responses", async function(){
    //This test would be very useful but it has a race condition that makes it unreliable.
    await vfs.createScene("foo").then((scene_id)=> {userManager.setDefaultAccess(scene_id, "write"); return scene_id});
    let orig = vfs.getFile;
    let stream = (Readable.from(["hello", "world", "\n"]) as any).map((s:string)=>new Promise(r=>setTimeout(()=>r(s), 4)));
    let d = stream.destroy;
    let calls:Array<Error|undefined> = [];
    stream.destroy = function(e :Error|undefined){
      calls.push(e);
      return d.call(stream, e);
    }
    try{
      vfs.getFile = (()=>Promise.resolve({
        id: 1,
        name: "models/foo.glb",
        hash: "tbudgBSg-bHWHiHnlteNzN8TUvI80ygS9IULh4rklEw",
        generation: 1,
        size: 10,
        mtime: new Date("2023-04-13T09:03:21.506Z"),
        ctime: new Date("2023-04-13T09:03:21.506Z"),
        mime: "model/gltf-binary",
        author_id: 0,
        author: "default",
        stream,
      }));

      let test = request(this.server).get("/scenes/foo/models/foo.glb")
      .buffer(false)
      .send();
      setTimeout(()=>(test as any).req.socket.end(), 5);
      let [err] = await Promise.all([
        once(stream, "close").catch(e=>e),
        expect(test).to.be.rejectedWith(/socket hang up/),
      ]);
      expect(err).to.have.property("code", "ERR_STREAM_PREMATURE_CLOSE");
      expect(calls, "stream.destroy() should be called on aborted requests").to.have.property("length", 1);

    }finally{
      vfs.getFile = orig;
    }
  });

    it("can get a range from a file", async function(){
    let scene_id = await vfs.createScene("foo").then((scene_id)=> {userManager.setPublicAccess(scene_id, "read"); return scene_id}); 
    await vfs.writeDoc("{}", {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
    await vfs.writeFile(dataStream(), {scene: "foo", mime:"model/gltf-binary", name: "models/foo.glb", user_id: user.uid});

    await (await request.agent(this.server).set("Range","bytes=1-2")).get("/scenes/foo/models/foo.glb")
    .expect(206)
    .expect("accept-ranges", "bytes")
    .expect("Content-range", "bytes 1-2/4")
    .expect("Content-Length","2")
    .expect("oo");
  });

  it("can get a range from a file with only start", async function(){
    let scene_id = await vfs.createScene("foo").then((scene_id)=> {userManager.setPublicAccess(scene_id, "read"); return scene_id}); 
    await vfs.writeDoc("{}", {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
    await vfs.writeFile(dataStream(), {scene: "foo", mime:"model/gltf-binary", name: "models/foo.glb", user_id: user.uid});

    await (await request.agent(this.server).set("Range","bytes=1-")).get("/scenes/foo/models/foo.glb")
    .expect(206)
    .expect("accept-ranges", "bytes")
    .expect("Content-range", "bytes 1-3/4")
    .expect("Content-Length","3")
    .expect("oo\n");
  });

    it("can get a suffix length from a file", async function(){
    let scene_id = await vfs.createScene("foo").then((scene_id)=> {userManager.setPublicAccess(scene_id, "read"); return scene_id}); 
    await vfs.writeDoc("{}", {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
    await vfs.writeFile(dataStream(), {scene: "foo", mime:"model/gltf-binary", name: "models/foo.glb", user_id: user.uid});

    await (await request.agent(this.server).set("Range","bytes=-2")).get("/scenes/foo/models/foo.glb")
    .expect(206)
    .expect("accept-ranges", "bytes")
    .expect("Content-range", "bytes 2-3/4")
    .expect("Content-Length","2")
    .expect("o\n");
  });

  it("can't get a range with end after the file end", async function(){
    let scene_id = await vfs.createScene("foo").then((scene_id)=> {userManager.setPublicAccess(scene_id, "read"); return scene_id}); 
    await vfs.writeDoc("{}", {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
    await vfs.writeFile(dataStream(), {scene: "foo", mime:"model/gltf-binary", name: "models/foo.glb", user_id: user.uid});

    await (await request.agent(this.server).set("Range","bytes=2-10")).get("/scenes/foo/models/foo.glb")
    .expect(416)
    .expect("Content-range", "bytes */4");
  });

    it("can't get a range with start after the file end", async function(){
    let scene_id = await vfs.createScene("foo").then((scene_id)=> {userManager.setPublicAccess(scene_id, "read"); return scene_id}); 
    await vfs.writeDoc("{}", {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
    await vfs.writeFile(dataStream(), {scene: "foo", mime:"model/gltf-binary", name: "models/foo.glb", user_id: user.uid});

    await (await request.agent(this.server).set("Range","bytes=20-100")).get("/scenes/foo/models/foo.glb")
    .expect(416)
    .expect("Content-range", "bytes */4");
  });

  it("can't get a range with start after the file end", async function(){
    let scene_id = await vfs.createScene("foo").then((scene_id)=> {userManager.setPublicAccess(scene_id, "read"); return scene_id}); 
    await vfs.writeDoc("{}", {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
    await vfs.writeFile(dataStream(), {scene: "foo", mime:"model/gltf-binary", name: "models/foo.glb", user_id: user.uid});

    await (await request.agent(this.server).set("Range","bytes=20-100")).get("/scenes/foo/models/foo.glb")
    .expect(416)
    .expect("Content-range", "bytes */4");
  });

  it("Returnq BadRequest on malformed range (\"bytes=-\")", async function(){
    let scene_id = await vfs.createScene("foo").then((scene_id)=> {userManager.setPublicAccess(scene_id, "read"); return scene_id}); 
    await vfs.writeDoc("{}", {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
    await vfs.writeFile(dataStream(), {scene: "foo", mime:"model/gltf-binary", name: "models/foo.glb", user_id: user.uid});

    await (await request.agent(this.server).set("Range","bytes=-")).get("/scenes/foo/models/foo.glb")
    .expect(400);
  });
  

  it("Returns BadRequest on empty range (\"bytes=\")", async function(){
    let scene_id = await vfs.createScene("foo").then((scene_id)=> {userManager.setPublicAccess(scene_id, "read"); return scene_id}); 
    await vfs.writeDoc("{}", {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
    await vfs.writeFile(dataStream(), {scene: "foo", mime:"model/gltf-binary", name: "models/foo.glb", user_id: user.uid});
  
    await (await request.agent(this.server).set("Range","bytes=")).get("/scenes/foo/models/foo.glb")
    .expect(400);
  });

  it("Returns BadRequest on mutliple ranges", async function(){
    let scene_id = await vfs.createScene("foo").then((scene_id)=> {userManager.setPublicAccess(scene_id, "read"); return scene_id}); 
    await vfs.writeDoc("{}", {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
    await vfs.writeFile(dataStream(), {scene: "foo", mime:"model/gltf-binary", name: "models/foo.glb", user_id: user.uid});

    await (await request.agent(this.server).set("Range","bytes=20-100, 200-300")).get("/scenes/foo/models/foo.glb")
    .expect(400);
  });

});

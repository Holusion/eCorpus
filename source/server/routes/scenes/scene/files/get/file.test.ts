import http, {ClientRequest} from "http"
import {once} from "events";
import {AddressInfo} from "node:net";
import {PassThrough, Readable} from "stream";
import timers from "node:timers/promises";

import request from "supertest";
import UserManager from "../../../../../auth/UserManager.js";
import User, { UserLevels } from "../../../../../auth/User.js";
import Vfs from "../../../../../vfs/index.js";




describe("GET /scenes/:scene/:filename(.*)", function(){
  
  let vfs :Vfs, userManager :UserManager, user :User, admin :User;

  this.beforeAll(async function(){
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager = locals.userManager;
  });
  this.beforeEach(async function(){
    await resetIntegrationContext(this);
    user = await userManager.addUser("bob", "12345678");
    admin = await userManager.addUser("alice", "12345678", "admin");
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

  it("destroys the file stream when the client aborts a response", async function(){
    //Replaces a version of this test that was disabled as flaky. That one raced a
    //fixed 5ms timer against a stream emitting a chunk every 4ms; here every wait is
    //on a causal event -- the client holds the first byte, the stream has closed --
    //so there is no timing to lose.
    await vfs.createScene("foo").then((scene_id)=> {userManager.setPublicAccess(scene_id, "read"); return scene_id});

    //A stream the test drives by hand, so bytes move only when we say so
    const stream = new PassThrough();
    const destroy = stream.destroy.bind(stream);
    const calls :Array<Error|undefined> = [];
    stream.destroy = function(e ?:Error){ calls.push(e); return destroy(e); } as any;

    const orig = vfs.getFile;
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
    })) as any;

    //A real socket of our own, because supertest gives no handle on hanging up
    const server = http.createServer(this.server);
    try{
      server.listen(0);
      await once(server, "listening");
      const {port} = server.address() as AddressInfo;

      const req = http.request({port, method: "GET", path: "/scenes/foo/models/foo.glb"});
      req.on("error", ()=>{}); //The abort surfaces here. Not what we're testing.
      req.end();

      //Queue the chunk up front rather than after the response arrives: express only
      //flushes the headers once the handler writes, so waiting for them first would
      //deadlock against a stream that is waiting for us.
      stream.write("hello");

      const [res] = await once(req, "response");
      await once(res, "data"); //The body is provably flowing to the client...
      req.destroy();           //...so aborting now can only interrupt it mid-stream

      //once() rejects on 'error', and a premature close is precisely what pipeline
      //destroys the source with, so the rejection is the signal rather than a failure.
      const err = await once(stream, "close").catch(e=>e);
      expect(err).to.have.property("code", "ERR_STREAM_PREMATURE_CLOSE");
      expect(calls, "stream.destroy() should be called on aborted requests").to.have.length(1);
    }finally{
      vfs.getFile = orig;
      server.closeAllConnections();
      server.close();
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

  it("can't get a range that ends before it starts", async function(){
    //Reversed ranges reach us from real clients. They used to be handed straight to
    //createReadStream(), which threw a RangeError and got reported as a 500.
    let scene_id = await vfs.createScene("foo").then((scene_id)=> {userManager.setPublicAccess(scene_id, "read"); return scene_id});
    await vfs.writeDoc("{}", {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
    await vfs.writeFile(dataStream(), {scene: "foo", mime:"model/gltf-binary", name: "models/foo.glb", user_id: user.uid});

    await (await request.agent(this.server).set("Range","bytes=3-1")).get("/scenes/foo/models/foo.glb")
    .expect(400);
  });

  it("Returns BadRequest on a non-numeric range", async function(){
    let scene_id = await vfs.createScene("foo").then((scene_id)=> {userManager.setPublicAccess(scene_id, "read"); return scene_id});
    await vfs.writeDoc("{}", {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
    await vfs.writeFile(dataStream(), {scene: "foo", mime:"model/gltf-binary", name: "models/foo.glb", user_id: user.uid});

    await (await request.agent(this.server).set("Range","bytes=abc-def")).get("/scenes/foo/models/foo.glb")
    .expect(400);
  });

  it("can't get a range with start after the file end and no end", async function(){
    let scene_id = await vfs.createScene("foo").then((scene_id)=> {userManager.setPublicAccess(scene_id, "read"); return scene_id});
    await vfs.writeDoc("{}", {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
    await vfs.writeFile(dataStream(), {scene: "foo", mime:"model/gltf-binary", name: "models/foo.glb", user_id: user.uid});

    await (await request.agent(this.server).set("Range","bytes=20-")).get("/scenes/foo/models/foo.glb")
    .expect(416)
    .expect("Content-range", "bytes */4");
  });

  it("serves the whole file when the suffix is longer than the file", async function(){
    //RFC 9110 §14.1.2 : a suffix-length larger than the representation selects it entirely
    let scene_id = await vfs.createScene("foo").then((scene_id)=> {userManager.setPublicAccess(scene_id, "read"); return scene_id});
    await vfs.writeDoc("{}", {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
    await vfs.writeFile(dataStream(), {scene: "foo", mime:"model/gltf-binary", name: "models/foo.glb", user_id: user.uid});

    await (await request.agent(this.server).set("Range","bytes=-100")).get("/scenes/foo/models/foo.glb")
    .expect(206)
    .expect("Content-range", "bytes 0-3/4")
    .expect("Content-Length","4")
    .expect("foo\n");
  });

  it("Returns BadRequest on mutliple ranges", async function(){
    let scene_id = await vfs.createScene("foo").then((scene_id)=> {userManager.setPublicAccess(scene_id, "read"); return scene_id}); 
    await vfs.writeDoc("{}", {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
    await vfs.writeFile(dataStream(), {scene: "foo", mime:"model/gltf-binary", name: "models/foo.glb", user_id: user.uid});

    await (await request.agent(this.server).set("Range","bytes=20-100, 200-300")).get("/scenes/foo/models/foo.glb")
    .expect(400);
  });

});

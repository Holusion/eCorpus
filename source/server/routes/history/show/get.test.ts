
import request from "supertest";
import { randomBytes } from "crypto";

import Vfs from "../../../vfs/index.js";
import User from "../../../auth/User.js";
import UserManager from "../../../auth/UserManager.js";


describe("GET /history/:scene/:id/show/:name", function(){
  let vfs :Vfs, userManager :UserManager, user :User, admin :User, opponent :User;
  let titleSlug :string, scene_id :number;

  this.beforeAll(async function(){
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager = locals.userManager;
    user = await userManager.addUser("bob", "12345678");
    admin = await userManager.addUser("alice", "12345678", "admin");
    opponent = await userManager.addUser("oscar", "12345678");
  });

  this.beforeEach(async function(){
    titleSlug = this.currentTest?.title.replace(/[^\w]/g, "_").slice(0,15)+"_"+randomBytes(4).toString("base64url");
    scene_id = await vfs.createScene(titleSlug, user.uid);
  });

  it("returns a document's content as it was before a given history id", async function(){
    let revs = [];
    for(let i = 0; i < 3; i++){
      revs.push(await vfs.writeDoc(`{"id":${i}}`, {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"}));
    }
    // Probe at the second revision: must return v1 (the version that was "current" when v2 was written).
    let res = await request(this.server).get(`/history/${titleSlug}/${revs[1].id}/show/scene.svx.json`)
    .auth("bob", "12345678")
    .expect(200);
    expect(res.text).to.equal(`{"id":1}`);

    // Probe at the third revision: must return v2.
    res = await request(this.server).get(`/history/${titleSlug}/${revs[2].id}/show/scene.svx.json`)
    .auth("bob", "12345678")
    .expect(200);
    expect(res.text).to.equal(`{"id":2}`);
  });

  it("serves binary files unchanged at a historical point", async function(){
    let payload = randomBytes(64);
    let ref = await vfs.writeFile(dataStream([payload]), {scene: scene_id, user_id: user.uid, name: "models/cube.glb", mime: "model/gltf-binary"});
    // Overwrite with new content; the show route must still return the historical bytes.
    await vfs.writeFile(dataStream([randomBytes(32)]), {scene: scene_id, user_id: user.uid, name: "models/cube.glb", mime: "model/gltf-binary"});

    let res = await request(this.server).get(`/history/${titleSlug}/${ref.id}/show/models/cube.glb`)
    .auth("bob", "12345678")
    .buffer(true)
    .parse((res, cb)=>{
      let chunks :Buffer[] = [];
      res.on("data", (c:Buffer)=> chunks.push(c));
      res.on("end", ()=> cb(null, Buffer.concat(chunks)));
    })
    .expect(200)
    .expect("Content-Type", "model/gltf-binary");
    expect(Buffer.compare(res.body as Buffer, payload)).to.equal(0);
    expect(res.headers["content-length"]).to.equal(payload.length.toString(10));
  });

  it("respects file deletions at the reference point", async function(){
    await vfs.writeDoc(`{"id":1}`, {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
    let v1 = await vfs.writeFile(dataStream(["hello"]), {scene: scene_id, user_id: user.uid, name: "articles/a.txt", mime: "text/html"});
    await vfs.removeFile({scene: scene_id, user_id: user.uid, name: "articles/a.txt", mime: "text/html"});
    let after = await vfs.writeDoc(`{"id":2}`, {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});

    // Before removal: file must be served.
    let res = await request(this.server).get(`/history/${titleSlug}/${v1.id}/show/articles/a.txt`)
    .auth("bob", "12345678")
    .expect(200);
    expect(res.text).to.equal("hello");

    // After removal: file is gone at that point in history.
    await request(this.server).get(`/history/${titleSlug}/${after.id}/show/articles/a.txt`)
    .auth("bob", "12345678")
    .expect(404);
  });

  it("sets cache headers (ETag, Last-Modified, Content-Length, Accept-Ranges)", async function(){
    let ref = await vfs.writeDoc(`{"id":1}`, {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
    let res = await request(this.server).get(`/history/${titleSlug}/${ref.id}/show/scene.svx.json`)
    .auth("bob", "12345678")
    .expect(200);
    expect(res.headers).to.have.property("etag").match(/^W\//);
    expect(res.headers).to.have.property("last-modified").that.is.a("string");
    expect(res.headers).to.have.property("accept-ranges", "bytes");
    expect(res.headers).to.have.property("content-length", Buffer.byteLength(`{"id":1}`).toString(10));
  });

  it("returns 304 on a conditional GET that matches the ETag", async function(){
    let ref = await vfs.writeDoc(`{"id":1}`, {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
    let first = await request(this.server).get(`/history/${titleSlug}/${ref.id}/show/scene.svx.json`)
    .auth("bob", "12345678")
    .expect(200);
    let etag = first.headers.etag;
    expect(etag).to.be.a("string");

    let res = await request(this.server).get(`/history/${titleSlug}/${ref.id}/show/scene.svx.json`)
    .auth("bob", "12345678")
    .set("If-None-Match", etag)
    .expect(304);
    expect(res.text || "").to.equal("");
  });

  it("rejects directory paths with 400", async function(){
    let ref = await vfs.writeFile(dataStream(["hello"]), {scene: scene_id, user_id: user.uid, name: "articles/a.txt", mime: "text/html"});
    await request(this.server).get(`/history/${titleSlug}/${ref.id}/show/articles`)
    .auth("bob", "12345678")
    .expect(400);
  });

  it("returns 404 for a name that does not exist at the reference point", async function(){
    let ref = await vfs.writeDoc(`{"id":1}`, {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
    await request(this.server).get(`/history/${titleSlug}/${ref.id}/show/articles/missing.html`)
    .auth("bob", "12345678")
    .expect(404);
  });

  it("returns 404 for an unknown scene", async function(){
    await request(this.server).get(`/history/does-not-exist/1/show/scene.svx.json`)
    .auth("bob", "12345678")
    .expect(404);
  });

  it("returns 400 for an invalid (non-numeric) reference id", async function(){
    await vfs.writeDoc(`{"id":1}`, {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
    await request(this.server).get(`/history/${titleSlug}/abc/show/scene.svx.json`)
    .auth("bob", "12345678")
    .expect(400);
  });

  describe("permissions", function(){
    let ref :{id:number};
    this.beforeEach(async function(){
      ref = await vfs.writeDoc(`{"id":1}`, {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
      await userManager.setPublicAccess(titleSlug, "read");
      await userManager.setDefaultAccess(titleSlug, "read");
    });

    it("404s for anonymous (no write access)", async function(){
      await request(this.server).get(`/history/${titleSlug}/${ref.id}/show/scene.svx.json`)
      .expect(404);
    });

    it("404s for a read-only user", async function(){
      await request(this.server).get(`/history/${titleSlug}/${ref.id}/show/scene.svx.json`)
      .auth("oscar", "12345678")
      .expect(404);
    });

    it("succeeds for a write user", async function(){
      await userManager.grant(titleSlug, "oscar", "write");
      await request(this.server).get(`/history/${titleSlug}/${ref.id}/show/scene.svx.json`)
      .auth("oscar", "12345678")
      .expect(200);
    });

    it("succeeds for an admin", async function(){
      await request(this.server).get(`/history/${titleSlug}/${ref.id}/show/scene.svx.json`)
      .auth("alice", "12345678")
      .expect(200);
    });
  });
});

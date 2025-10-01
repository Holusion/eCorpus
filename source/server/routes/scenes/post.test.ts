import fs from "fs/promises";

import request from "supertest";

import UserManager from "../../auth/UserManager.js";
import { NotFoundError } from "../../utils/errors.js";
import Vfs from "../../vfs/index.js";
import User, { UserLevels } from "../../auth/User.js";


function binaryParser(res:request.Response, callback:(err:Error|null, data:Buffer)=>any) {
  res.setEncoding('binary');
  let data = '';
  res.on('data', function (chunk) {
    data += chunk;
  });
  res.on('end', function () {
      callback(null, Buffer.from(data, 'binary'));
  });
}

describe("POST /scenes", function(){
  let vfs:Vfs, userManager:UserManager, ids :number[];
  this.beforeEach(async function(){
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager  = locals.userManager;
  });
  this.afterEach(async function(){
    await cleanIntegrationContext(this);
  });

  describe("as create", function () {
    let user :User;
    this.beforeEach(async function(){
      user = await userManager.addUser("alice", "12345678", "create");
    });
    it("can import (as returned from GET /scenes)", async function(){
      //Where scenes are exported from the `GET /scenes` endpoint
      await vfs.createScene("foo", user.uid);
      await vfs.writeDoc(`{"id":1}`, {scene: "foo", user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
      let {hash: fileHash} = await vfs.writeFile(dataStream(), {scene:"foo", name:"articles/hello.html", mime: "text/html", user_id:user.uid});
  
      await vfs.createScene("bar", user.uid);
      await vfs.writeDoc(`{"id":2}`, {scene: "bar", user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
      await vfs.writeFile(dataStream(), {scene:"bar", name:"articles/hello.html", mime: "text/html", user_id:user.uid});
  
      let zip = await request(this.server).get("/scenes")
      .auth("alice", "12345678")
      .set("Accept", "application/zip")
      .parse(binaryParser)
      .expect(200)
      .expect("Content-Type", "application/zip");
      
      expect(Buffer.isBuffer(zip.body), `Expected a buffer. got : ${zip.body}`).to.be.true;
  
      //Change the data
      await vfs.removeScene("foo");
      await expect(vfs.getFileProps({scene:"foo", name:"articles/hello.html"})).to.be.rejectedWith(NotFoundError);
      await vfs.removeScene("bar");
      await expect(vfs.getScene("bar")).to.be.rejectedWith(NotFoundError);
  
      let res = await request(this.server).post("/scenes")
      .auth("alice", "12345678")
      .set("Content-Type", "application/zip")
      .send(zip.body)
      .expect(200);
  
      await expect(vfs.getScene("foo"), `scene "foo" should now exist`).to.be.fulfilled.to.be.ok;
      await expect(vfs.getScene("bar"), `scene "bar" should now exist`).to.be.fulfilled.to.be.ok;
      let {id}= await vfs.getScene("foo");
      expect(await vfs.getFileProps({scene: "foo", name:"articles/hello.html"})).to.have.property("hash", fileHash);
      expect(await vfs.getDoc(id)).to.have.property("data", `{"id":1}`);
    });
  
    it("can import (as returned from GET /scenes/:scene)", async function(){
      await vfs.createScene("foo", user.uid);
      let {hash: docHash} = await vfs.writeDoc(`{"id":1}`, {scene: "foo", user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
      let {hash: fileHash} = await vfs.writeFile(dataStream(), {scene:"foo", name:"articles/hello.html", mime: "text/html", user_id:user.uid});
  
      //Scene is exported from the `GET /scenes/{id}` endpoint
      let zip = await request(this.server).get("/scenes/foo")
      .auth("alice", "12345678")
      .set("Accept", "application/zip")
      .parse(binaryParser)
      .expect(200)
      .expect("Content-Type", "application/zip");
      expect(Buffer.isBuffer(zip.body), `Expected a buffer. got : ${zip.body}`).to.be.true;
      //Change the data
      await vfs.removeScene("foo");
      await expect(vfs.getFileProps({scene:"foo", name:"articles/hello.html"})).to.be.rejectedWith(NotFoundError);
  
      let res = await request(this.server).post("/scenes")
      .auth("alice", "12345678")
      .set("Content-Type", "application/zip")
      .send(zip.body)
      .expect(200);
  
      expect(res.body).to.be.an("object");
      expect(res.body.ok).to.deep.equal([
        'foo',
        'foo/articles/hello.html',
        'foo/scene.svx.json'
      ]);
      await expect(vfs.getScene("foo"), `expect scene "foo" to be restored`).to.be.fulfilled;
      let {id}= await vfs.getScene("foo");
      const doc = await vfs.getDoc(id);
      expect(doc).to.have.property("hash", docHash);
      expect(doc).to.have.property("data", `{"id":1}`);
      expect(await vfs.getFileProps({scene: "foo", name:"articles/hello.html"})).to.have.property("hash", fileHash);
    });
  
    it("rejects invalid Zip file", async function(){
      let res = await request(this.server).post("/scenes")
      .auth("alice", "12345678")
      .set("Content-Type", "application/zip")
      .send("Foo")
      .expect(500);
      //We don't know whether it's the client or us that can't read the Zip so better return a 500
      //Code 500 is practical to differentiate "bad data" from "bad encoding" (see following tests)
      //If return code is ever changed to 400, we need to specify those tests further.
    });
  
    it("rejects multipart-encoded data", async function(){
      let res = await request(this.server).post("/scenes")
      .auth("alice", "12345678")
      .set("Content-Type", "multipart/form-data; boundary=----WebKitFormBoundaryguENXa8ihViAuUPl")
      .attach("files", Buffer.from("foo\n"), {filename: "scenes.zip"})
      .expect(400);
      //While a multipart-encoded zip archive is _reasonable_, we don't support multipart parsing right now
    })

    it("reject zip import on non-admin scene", async function () {
      let user2 = await userManager.addUser("ulysse", "12345678", "use");
      await vfs.createScene("foo", user2.uid); // Works because checks to allow the creation of scene are done on the API routes, not on the vfs. 
      await vfs.writeDoc(`{"id":1}`, { scene: "foo", user_id: user2.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json" });
      let { hash: fileHash } = await vfs.writeFile(dataStream(), { scene: "foo", name: "articles/hello.html", mime: "text/html", user_id: user2.uid });

      let zip = await request(this.server).get("/scenes")
        .auth("alice", "12345678")
        .set("Accept", "application/zip")
        .parse(binaryParser)
        .expect(200)
        .expect("Content-Type", "application/zip");

      expect(Buffer.isBuffer(zip.body), `Expected a buffer. got : ${zip.body}`).to.be.true;

      await vfs.removeFile({ scene: "foo", name: "articles/hello.html", mime: "text/html", user_id: user2.uid });
      await expect(vfs.getFileProps({ scene: "foo", name: "articles/hello.html" })).to.be.rejectedWith(NotFoundError);

      let res = await request(this.server).post("/scenes")
        .auth("alice", "12345678")
        .set("Content-Type", "application/zip")
        .send(zip.body)
        .expect(401);
      expect(res.body.failed_scenes).not.to.be.empty;
      expect(res.body.failed_scenes).to.deep.equal({ foo: 'User does not have writting rights on the scene' });

      await expect(vfs.getScene("foo"), `scene "foo" should still exist`).to.be.fulfilled.to.be.ok;
      await expect(vfs.getFileProps({ scene: "foo", name: "articles/hello.html" })).to.be.rejectedWith(NotFoundError);
    });

    it("Fails on importing a zip with one or more scene with errors", async function () {
      let user2 = await userManager.addUser("ulysse", "12345678", "use");
      await vfs.createScene("foo", user2.uid); // Works because checks to allow the creation of scene are done on the API routes, not on the vfs. 
      await vfs.writeDoc(`{"id":1}`, { scene: "foo", user_id: user2.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json" });
      let { hash: fileHash } = await vfs.writeFile(dataStream(), { scene: "foo", name: "articles/hello.html", mime: "text/html", user_id: user2.uid });

      await vfs.createScene("bar", user.uid);
      await vfs.writeDoc(`{"id":2}`, { scene: "bar", user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json" });
      await vfs.writeFile(dataStream(), { scene: "bar", name: "articles/hello.html", mime: "text/html", user_id: user.uid });

      let zip = await request(this.server).get("/scenes")
        .auth("alice", "12345678")
        .set("Accept", "application/zip")
        .parse(binaryParser)
        .expect(200)
        .expect("Content-Type", "application/zip");

      expect(Buffer.isBuffer(zip.body), `Expected a buffer. got : ${zip.body}`).to.be.true;

      await vfs.removeFile({ scene: "foo", name: "articles/hello.html", mime: "text/html", user_id: user2.uid });
      await expect(vfs.getFileProps({ scene: "foo", name: "articles/hello.html" })).to.be.rejectedWith(NotFoundError);
      await vfs.removeFile({ scene: "bar", name: "articles/hello.html", mime: "text/html", user_id: user2.uid });
      await expect(vfs.getFileProps({ scene: "bar", name: "articles/hello.html" })).to.be.rejectedWith(NotFoundError);

      let res = await request(this.server).post("/scenes")
        .auth("alice", "12345678")
        .set("Content-Type", "application/zip")
        .send(zip.body)
        .expect(401);
      expect(res.body.failed_scenes).not.to.be.empty;
      expect(res.body.failed_scenes).to.deep.equal({foo: "User does not have writting rights on the scene"});

      await expect(vfs.getScene("foo"), `scene "foo" should still exist`).to.be.fulfilled.to.be.ok;
      await expect(vfs.getFileProps({ scene: "foo", name: "articles/hello.html" })).to.be.rejectedWith(NotFoundError);
      await expect(vfs.getScene("bar"), `scene "bar" should still exist`).to.be.fulfilled.to.be.ok;
      expect(await vfs.getFileProps({ scene: "bar", name: "articles/hello.html" })).to.have.property("hash", fileHash);
    });

  })


  describe("as use", function () {
    let user: User;
    let adminUser: User;
    this.beforeEach(async function () {
      user = await userManager.addUser("ulysse", "12345678", "use");
    });
    describe("as scene admin", function () {

      it("can import a zip of scenes (as returned from GET /scenes)", async function () {
        //Where scenes are exported from the `GET /scenes` endpoint
        await vfs.createScene("foo", user.uid); // Works because checks to allow the creation of scene are done on the API routes, not on the vfs. 
        await vfs.writeDoc(`{"id":1}`, { scene: "foo", user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json" });
        let { hash: fileHash } = await vfs.writeFile(dataStream(), { scene: "foo", name: "articles/hello.html", mime: "text/html", user_id: user.uid });

        await vfs.createScene("bar", user.uid);
        await vfs.writeDoc(`{"id":2}`, { scene: "bar", user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json" });
        await vfs.writeFile(dataStream(), { scene: "bar", name: "articles/hello.html", mime: "text/html", user_id: user.uid });

        let zip = await request(this.server).get("/scenes")
          .auth("ulysse", "12345678")
          .set("Accept", "application/zip")
          .parse(binaryParser)
          .expect(200)
          .expect("Content-Type", "application/zip");

        expect(Buffer.isBuffer(zip.body), `Expected a buffer. got : ${zip.body}`).to.be.true;

        await vfs.removeFile({ scene: "foo", name: "articles/hello.html", mime: "text/html", user_id: user.uid });
        await expect(vfs.getFileProps({ scene: "foo", name: "articles/hello.html" })).to.be.rejectedWith(NotFoundError);

        let res = await request(this.server).post("/scenes")
          .auth("ulysse", "12345678")
          .set("Content-Type", "application/zip")
          .send(zip.body)
          .expect(200);

        await expect(vfs.getScene("foo"), `scene "foo" should now exist`).to.be.fulfilled.to.be.ok;
        await expect(vfs.getScene("bar"), `scene "bar" should now exist`).to.be.fulfilled.to.be.ok;
        let { id } = await vfs.getScene("foo");
        expect(await vfs.getFileProps({ scene: "foo", name: "articles/hello.html" })).to.have.property("hash", fileHash);
        expect(await vfs.getDoc(id)).to.have.property("data", `{"id":1}`);
      });

      it("can import (as returned from GET /scenes/:scene)", async function () {
        await vfs.createScene("foo", user.uid);
        let { hash: docHash } = await vfs.writeDoc(`{"id":1}`, { scene: "foo", user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json" });
        let { hash: fileHash } = await vfs.writeFile(dataStream(), { scene: "foo", name: "articles/hello.html", mime: "text/html", user_id: user.uid });

        //Scene is exported from the `GET /scenes/{id}` endpoint
        let zip = await request(this.server).get("/scenes/foo")
          .auth("ulysse", "12345678")
          .set("Accept", "application/zip")
          .parse(binaryParser)
          .expect(200)
          .expect("Content-Type", "application/zip");
        expect(Buffer.isBuffer(zip.body), `Expected a buffer. got : ${zip.body}`).to.be.true;
        //Change the data
        await vfs.removeFile({ scene: "foo", name: "articles/hello.html", mime: "text/html", user_id: user.uid });
        await expect(vfs.getFileProps({ scene: "foo", name: "articles/hello.html" })).to.be.rejectedWith(NotFoundError);

        let res = await request(this.server).post("/scenes")
          .auth("ulysse", "12345678")
          .set("Content-Type", "application/zip")
          .send(zip.body)
          .expect(200);

        expect(res.body).to.be.an("object");
        expect(res.body.ok).to.deep.equal([
          'foo',
          'foo/articles/hello.html',
          'foo/scene.svx.json'
        ]);
        await expect(vfs.getScene("foo"), `expect scene "foo" to be restored`).to.be.fulfilled;
        let { id } = await vfs.getScene("foo");
        const doc = await vfs.getDoc(id);
        expect(doc).to.have.property("hash", docHash);
        expect(doc).to.have.property("data", `{"id":1}`);
        expect(await vfs.getFileProps({ scene: "foo", name: "articles/hello.html" })).to.have.property("hash", fileHash);
      });

      it("rejects invalid Zip file", async function () {
        let res = await request(this.server).post("/scenes")
          .auth("ulysse", "12345678")
          .set("Content-Type", "application/zip")
          .send("Foo")
          .expect(500);
        //We don't know whether it's the client or us that can't read the Zip so better return a 500
        //Code 500 is practical to differentiate "bad data" from "bad encoding" (see following tests)
        //If return code is ever changed to 400, we need to specify those tests further.
      });

      it("rejects multipart-encoded data", async function () {
        let res = await request(this.server).post("/scenes")
          .auth("ulysse", "12345678")
          .set("Content-Type", "multipart/form-data; boundary=----WebKitFormBoundaryguENXa8ihViAuUPl")
          .attach("files", Buffer.from("foo\n"), { filename: "scenes.zip" })
          .expect(400);
        //While a multipart-encoded zip archive is _reasonable_, we don't support multipart parsing right now
      })
    });

    it("reject zip import on non-existing scene", async function () {
      await vfs.createScene("foo", user.uid); // Works because checks to allow the creation of scene are done on the API routes, not on the vfs. 
      await vfs.writeDoc(`{"id":1}`, { scene: "foo", user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json" });
      let { hash: fileHash } = await vfs.writeFile(dataStream(), { scene: "foo", name: "articles/hello.html", mime: "text/html", user_id: user.uid });

      let zip = await request(this.server).get("/scenes")
        .auth("ulysse", "12345678")
        .set("Accept", "application/zip")
        .parse(binaryParser)
        .expect(200)
        .expect("Content-Type", "application/zip");

      expect(Buffer.isBuffer(zip.body), `Expected a buffer. got : ${zip.body}`).to.be.true;

      await vfs.removeScene("foo");
      await expect(vfs.getScene("foo")).to.be.rejectedWith(NotFoundError);

      let res = await request(this.server).post("/scenes")
        .auth("ulysse", "12345678")
        .set("Content-Type", "application/zip")
        .send(zip.body)
        .expect(401);
      expect(res.body.failed_scenes).not.to.be.empty;
      expect(res.body.failed_scenes).to.deep.equal({foo: "User cannot create a scene"});

      await expect(vfs.getScene("foo")).to.be.rejectedWith(NotFoundError);
    });

    it("reject zip import on non-admin scene", async function () {
      let user2 = await userManager.addUser("alice", "12345678", "use");
      await vfs.createScene("foo", user2.uid); // Works because checks to allow the creation of scene are done on the API routes, not on the vfs. 
      await vfs.writeDoc(`{"id":1}`, { scene: "foo", user_id: user2.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json" });
      let { hash: fileHash } = await vfs.writeFile(dataStream(), { scene: "foo", name: "articles/hello.html", mime: "text/html", user_id: user2.uid });

      let zip = await request(this.server).get("/scenes")
        .auth("ulysse", "12345678")
        .set("Accept", "application/zip")
        .parse(binaryParser)
        .expect(200)
        .expect("Content-Type", "application/zip");

      expect(Buffer.isBuffer(zip.body), `Expected a buffer. got : ${zip.body}`).to.be.true;

      await vfs.removeFile({ scene: "foo", name: "articles/hello.html", mime: "text/html", user_id: user2.uid });
      await expect(vfs.getFileProps({ scene: "foo", name: "articles/hello.html" })).to.be.rejectedWith(NotFoundError);

      let res = await request(this.server).post("/scenes")
        .auth("ulysse", "12345678")
        .set("Content-Type", "application/zip")
        .send(zip.body)
        .expect(401);
      expect(res.body.failed_scenes).not.to.be.empty;
      expect(res.body.failed_scenes).to.deep.equal({foo: 'User does not have writting rights on the scene'});

      await expect(vfs.getScene("foo"), `scene "foo" should still exist`).to.be.fulfilled.to.be.ok;
      await expect(vfs.getFileProps({ scene: "foo", name: "articles/hello.html" })).to.be.rejectedWith(NotFoundError);
    });

    it("Fails on importing a zip with one or more scene with errors", async function () {
      let user2 = await userManager.addUser("alice", "12345678", "use");
      await vfs.createScene("foo", user2.uid); // Works because checks to allow the creation of scene are done on the API routes, not on the vfs. 
      await vfs.writeDoc(`{"id":1}`, { scene: "foo", user_id: user2.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json" });
      let { hash: fileHash } = await vfs.writeFile(dataStream(), { scene: "foo", name: "articles/hello.html", mime: "text/html", user_id: user2.uid });

      await vfs.createScene("bar", user.uid);
      await vfs.writeDoc(`{"id":2}`, { scene: "bar", user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json" });
      await vfs.writeFile(dataStream(), { scene: "bar", name: "articles/hello.html", mime: "text/html", user_id: user.uid });

      let zip = await request(this.server).get("/scenes")
        .auth("ulysse", "12345678")
        .set("Accept", "application/zip")
        .parse(binaryParser)
        .expect(200)
        .expect("Content-Type", "application/zip");

      expect(Buffer.isBuffer(zip.body), `Expected a buffer. got : ${zip.body}`).to.be.true;

      await vfs.removeFile({ scene: "foo", name: "articles/hello.html", mime: "text/html", user_id: user2.uid });
      await expect(vfs.getFileProps({ scene: "foo", name: "articles/hello.html" })).to.be.rejectedWith(NotFoundError);
      await vfs.removeFile({ scene: "bar", name: "articles/hello.html", mime: "text/html", user_id: user2.uid });
      await expect(vfs.getFileProps({ scene: "bar", name: "articles/hello.html" })).to.be.rejectedWith(NotFoundError);

      let res = await request(this.server).post("/scenes")
        .auth("ulysse", "12345678")
        .set("Content-Type", "application/zip")
        .send(zip.body)
        .expect(401);
      expect(res.body.failed_scenes).not.to.be.empty;
      expect(res.body.failed_scenes).to.deep.equal({foo: "User does not have writting rights on the scene"});

      await expect(vfs.getScene("foo"), `scene "foo" should still exist`).to.be.fulfilled.to.be.ok;
      await expect(vfs.getFileProps({ scene: "foo", name: "articles/hello.html" })).to.be.rejectedWith(NotFoundError);
      await expect(vfs.getScene("bar"), `scene "bar" should still exist`).to.be.fulfilled.to.be.ok;
      expect(await vfs.getFileProps({ scene: "bar", name: "articles/hello.html" })).to.have.property("hash", fileHash);
    });
  });

  describe("as admin", function () {
    let user: User;
    let adminUser: User;
    this.beforeEach(async function () {
      user = await userManager.addUser("alice", "12345678", "admin");
    });

    it("can overwrite any scene with a zip", async function () {
      let user2 = await userManager.addUser("ulysse", "12345678", "use");
      await vfs.createScene("foo", user2.uid); // Works because checks to allow the creation of scene are done on the API routes, not on the vfs. 
      await vfs.writeDoc(`{"id":1}`, { scene: "foo", user_id: user2.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json" });
      let { hash: fileHash } = await vfs.writeFile(dataStream(), { scene: "foo", name: "articles/hello.html", mime: "text/html", user_id: user2.uid });

      let zip = await request(this.server).get("/scenes")
        .auth("alice", "12345678")
        .set("Accept", "application/zip")
        .parse(binaryParser)
        .expect(200)
        .expect("Content-Type", "application/zip");

      expect(Buffer.isBuffer(zip.body), `Expected a buffer. got : ${zip.body}`).to.be.true;

      await vfs.removeFile({ scene: "foo", name: "articles/hello.html", mime: "text/html", user_id: user2.uid });
      await expect(vfs.getFileProps({ scene: "foo", name: "articles/hello.html" })).to.be.rejectedWith(NotFoundError);

      let res = await request(this.server).post("/scenes")
        .auth("alice", "12345678")
        .set("Content-Type", "application/zip")
        .send(zip.body)
        .expect(200);

      await expect(vfs.getScene("foo"), `scene "foo" should still exist`).to.be.fulfilled.to.be.ok;
      expect(await vfs.getFileProps({ scene: "foo", name: "articles/hello.html" })).to.have.property("hash", fileHash);
    });
  });
});


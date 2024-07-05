import fs from "fs/promises";

import request from "supertest";

import UserManager from "../../auth/UserManager.js";
import { NotFoundError } from "../../utils/errors.js";
import Vfs from "../../vfs/index.js";


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
    await vfs.close();
    await fs.rm(this.dir, {recursive: true});
  });

  it("requires admin rights", async function(){
    await userManager.addUser("bob", "12345678", false);
    await request(this.server).post("/scenes")
    .auth("bob", "12345678")
    .send("xxx") //don't care
    .expect(401);
  });

  it("can import a zip of exported scenes", async function(){
    //Where scenes are exported from the `GET /scenes` endpoint
    const user = await userManager.addUser("alice", "12345678", true);
    await vfs.createScene("foo", user.uid);
    await vfs.writeDoc(`{"id":1}`, "foo", user.uid);
    await vfs.writeFile(dataStream(), {scene:"foo", name:"articles/hello.html", mime: "text/html", user_id:user.uid});

    await vfs.createScene("bar", user.uid);
    await vfs.writeDoc(`{"id":2}`, "bar", user.uid);
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

    expect(await vfs.getScene("foo")).to.be.ok;
    expect(await vfs.getScene("bar")).to.be.ok;
    let {id}= await vfs.getScene("foo");
    expect(await vfs.getFileProps({scene: "foo", name:"articles/hello.html"})).to.have.property("hash", "IHQcUEH8CVmcu6Jc_zSB5HCc0K9HPvP0XGSk3S6f0rQ");
    expect(await vfs.getDoc(id)).to.have.property("data", `{"id":1}`);
  });

  it("can import a scene zip", async function(){
    //Where scene is exported from the `GET /scenes/{id}` endpoint
    const user = await userManager.addUser("alice", "12345678", true);
    await vfs.createScene("foo", user.uid);
    await vfs.writeDoc(`{"id":1}`, "foo", user.uid);
    await vfs.writeFile(dataStream(), {scene:"foo", name:"articles/hello.html", mime: "text/html", user_id:user.uid});
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
    expect(res.body.fail).to.deep.equal([]);
    console.log(res.body.ok);
    expect(res.body.ok).to.deep.equal([
      'foo',
      'foo/articles/',
      'foo/articles/hello.html',
      'foo/models/',
      'foo/scene.svx.json'
    ]);

    await expect(vfs.getScene("foo")).to.be.fulfilled;
    let {id}= await vfs.getScene("foo");
    expect(await vfs.getFileProps({scene: "foo", name:"articles/hello.html"})).to.have.property("hash", "IHQcUEH8CVmcu6Jc_zSB5HCc0K9HPvP0XGSk3S6f0rQ");
    expect(await vfs.getDoc(id)).to.have.property("data", `{"id":1}`);
  });

});

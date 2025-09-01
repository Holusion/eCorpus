import request from "supertest";

import Vfs from "../../vfs/index.js";
import UserManager from "../../auth/UserManager.js";
import User from "../../auth/User.js";


describe("POST /tags", function () {
  let vfs: Vfs, userManager: UserManager, ids: number[], user: User, sceneAdminUser: User, admin: User;
  this.beforeEach(async function () {
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager = locals.userManager;
    admin = await userManager.addUser("adele", "xxxxxxxx", "admin");
    sceneAdminUser = await userManager.addUser("alice", "xxxxxxxx");
    user = await userManager.addUser("bob", "xxxxxxxx");
    const fooId = await vfs.createScene("foo");
    await userManager.grant(fooId, sceneAdminUser.uid, "admin");
    const barId = await vfs.createScene("bar")
    await userManager.grant(barId, sceneAdminUser.uid, "admin");
    ids = [fooId, barId];
  });

  this.afterEach(async function () {
    await cleanIntegrationContext(this);
  });

  it("Can create a tag using scene name", async function () {
    await request(this.server).post("/tags")
      .auth(sceneAdminUser.username, "xxxxxxxx")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ name: "myTag", scene: "foo" }))
      .expect(200);
    let s = await vfs.getScene(ids[0]);
    expect(s).to.have.property("tags").to.deep.equal(["myTag"]);
  });

  it("Can create a tag using scene id", async function () {
    await request(this.server).post("/tags")
      .auth(sceneAdminUser.username, "xxxxxxxx")
      .set("Content-Type", "application/json")
      .send({ name: "myTag", scene: ids[0] })
      .expect(200);
    let s = await vfs.getScene(ids[0]);
    expect(s).to.have.property("tags").to.deep.equal(["myTag"]);
  });

  it("Can create multiple tags", async function () {
    await request(this.server).post("/tags")
      .auth(sceneAdminUser.username, "xxxxxxxx")
      .set("Content-Type", "application/json")
      .send([{ name: "myTag", scene: ids[0].toString() },
      { name: "myTag", scene: "bar" }])
      .expect(200);
    let s = await vfs.getScene(ids[0]);
    expect(s).to.have.property("tags").to.deep.equal(["myTag"]);
    s = await vfs.getScene(ids[1]);
    expect(s).to.have.property("tags").to.deep.equal(["myTag"]);
  });

  it("Writing user can create tag", async function () {
    await userManager.grant(ids[0], user.uid, "write");
    await request(this.server).post("/tags")
      .auth(user.username, "xxxxxxxx")
      .set("Content-Type", "application/json")
      .send({ name: "myTag", scene: ids[0] })
      .expect(200);
    let s = await vfs.getScene(ids[0]);
    expect(s).to.have.property("tags").to.deep.equal(["myTag"]);
  });

  it("Admin user can create tag", async function () {
    await request(this.server).post("/tags")
      .auth(admin.username, "xxxxxxxx")
      .set("Content-Type", "application/json")
      .send({ name: "myTag", scene: ids[0] })
      .expect(200);
    let s = await vfs.getScene(ids[0]);
    expect(s).to.have.property("tags").to.deep.equal(["myTag"]);
  });

  it("Fail when no user", async function () {
    await request(this.server).post("/tags")
      .set("Content-Type", "application/json")
      .send({ name: "myTag", scene: ids[0] })
      .expect(401);
    let s = await vfs.getScene(ids[0]);
    expect(s).to.have.property("tags").to.deep.equal([]);
  });

  it("Fail when no user", async function () {
    await request(this.server).post("/tags")
      .set("Content-Type", "application/json")
      .send({ name: "myTag", scene: ids[0] })
      .expect(401);
    let s = await vfs.getScene(ids[0]);
    expect(s).to.have.property("tags").to.deep.equal([]);
  });

  it("Fail when scene does not exist", async function () {
    await request(this.server).post("/tags")
       .auth(admin.username, "xxxxxxxx")
      .set("Content-Type", "application/json")
      .send({ name: "myTag", scene: "bla_12456434874354578" })
      .expect(404);
  });
});

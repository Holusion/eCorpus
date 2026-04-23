import request from "supertest";
import User from "../../../auth/User.js";
import UserManager from "../../../auth/UserManager.js";



describe("PATCH /admin/config", function(){
  let userManager :UserManager, user :User, admin :User;

  this.beforeAll(async function(){
    let locals = await createIntegrationContext(this);
    userManager = locals.userManager;
    user = await userManager.addUser("bob", "12345678");
    admin = await userManager.addUser("alice", "12345678", "admin");
  });

  this.afterAll(async function(){
    await cleanIntegrationContext(this);
  });

  it("requires admin access", async function(){
    await request(this.server).patch(`/admin/config`)
    .send({})
    .expect(401);

    await request(this.server).patch(`/admin/config`)
    .auth(user.username, "12345678")
    .send({})
    .expect(401);

    await request(this.server).patch(`/admin/config`)
    .auth(admin.username, "12345678")
    .send({})
    .expect(204);
  });

  it("rejects non-object body", async function(){
    await request(this.server).patch(`/admin/config`)
    .auth(admin.username, "12345678")
    .send([])
    .expect(400);
  });

  it("rejects entry without value key", async function(){
    await request(this.server).patch(`/admin/config`)
    .auth(admin.username, "12345678")
    .send({ brand: { locked: false } })
    .expect(400);
  });

  it("updates a runtime config value using raw entry", async function(){
    await request(this.server).patch(`/admin/config`)
    .auth(admin.username, "12345678")
    .send({ brand: "Raw Brand" })
    .expect(204);

    const res = await request(this.server).get(`/admin/config`)
    .auth(admin.username, "12345678")
    .accept("application/json")
    .expect(200);

    const brandEntry = res.body["brand"];
    expect(brandEntry).to.exist;
    expect(brandEntry.value).to.equal("Raw Brand");
  });

  it("updates a runtime config value", async function(){
    await request(this.server).patch(`/admin/config`)
    .auth(admin.username, "12345678")
    .send({ brand: { value: "My Brand" } })
    .expect(204);

    const res = await request(this.server).get(`/admin/config`)
    .auth(admin.username, "12345678")
    .accept("application/json")
    .expect(200);

    const brandEntry = res.body["brand"];
    expect(brandEntry).to.exist;
    expect(brandEntry.value).to.equal("My Brand");
  });

  it("rejects updates with bad data type", async function(){
    await request(this.server).patch(`/admin/config`)
    .auth(admin.username, "12345678")
    .send({ verbose: "X"})
    .expect(403);
  });

  it("rejects updates to locked (static) config keys", async function(){
    await request(this.server).patch(`/admin/config`)
    .auth(admin.username, "12345678")
    .send({ port: { value: "9999" } })
    .expect(403);
  });


  it("rejects unknown config keys", async function(){
    await request(this.server).patch(`/admin/config`)
    .auth(admin.username, "12345678")
    .send({ nonexistent_key: { value: "foo" } })
    .expect(400);
  });
});

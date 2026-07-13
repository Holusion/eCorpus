import request from "supertest";
import User from "../../../auth/User.js";
import UserManager from "../../../auth/UserManager.js";



describe("PATCH /admin/config", function(){
  let userManager :UserManager, user :User, admin :User;

  this.beforeAll(async function(){
    // EXPERIMENTAL is provided through the environment, so it is locked at runtime.
    let locals = await createIntegrationContext(this, { EXPERIMENTAL: "false" });
    userManager = locals.userManager;
    user = await userManager.addUser("bob", "12345678");
    admin = await userManager.addUser("alice", "12345678", "admin");
  });

  //Rewriting runtime config requires instance:write, which is non-mintable
  //(smart_host redirection would intercept login-link emails): only an admin
  //*session* may patch it, never a token.
  async function adminAgent(server: any){
    const agent = request.agent(server);
    await agent.post("/auth/login")
      .send({username: admin.username, password: "12345678"})
      .set("Content-Type", "application/json")
      .set("Accept", "")
      .expect(200);
    return agent;
  }

  it("requires admin access", async function(){
    await request(this.server).patch(`/admin/config`)
    .send({})
    .expect(401);

    await request(this.server).patch(`/admin/config`)
    .set("Authorization", await bearer(user.username))
    .send({})
    .expect(401);

    await (await adminAgent(this.server)).patch(`/admin/config`)
    .send({})
    .expect(204);
  });

  it("requires a session: an admin's token can't rewrite the config", async function(){
    const res = await request(this.server).patch(`/admin/config`)
    .set("Authorization", await bearer(admin.username))
    .send({brand: "Hijacked"})
    .expect(403);
    expect(res.body).to.have.property("message").match(/insufficient_scope/);
  });

  it("rejects non-object body", async function(){
    await (await adminAgent(this.server)).patch(`/admin/config`)
    .send([])
    .expect(400);
  });

  it("rejects entry without value key", async function(){
    await (await adminAgent(this.server)).patch(`/admin/config`)
    .send({ brand: { locked: false } })
    .expect(400);
  });

  it("updates a runtime config value using raw entry", async function(){
    const agent = await adminAgent(this.server);
    await agent.patch(`/admin/config`)
    .send({ brand: "Raw Brand" })
    .expect(204);

    const res = await agent.get(`/admin/config`)
    .accept("application/json")
    .expect(200);

    const brandEntry = res.body["brand"];
    expect(brandEntry).to.exist;
    expect(brandEntry.value).to.equal("Raw Brand");
  });

  it("updates a runtime config value", async function(){
    const agent = await adminAgent(this.server);
    await agent.patch(`/admin/config`)
    .send({ brand: { value: "My Brand" } })
    .expect(204);

    const res = await agent.get(`/admin/config`)
    .accept("application/json")
    .expect(200);

    const brandEntry = res.body["brand"];
    expect(brandEntry).to.exist;
    expect(brandEntry.value).to.equal("My Brand");
  });

  it("rejects updates to runtime keys locked by an environment variable", async function(){
    await (await adminAgent(this.server)).patch(`/admin/config`)
    .send({ experimental: "X"})
    .expect(403);
  });

  it("rejects updates to locked (static) config keys", async function(){
    await (await adminAgent(this.server)).patch(`/admin/config`)
    .send({ port: { value: "9999" } })
    .expect(403);
  });


  it("rejects unknown config keys", async function(){
    await (await adminAgent(this.server)).patch(`/admin/config`)
    .send({ nonexistent_key: { value: "foo" } })
    .expect(400);
  });
});

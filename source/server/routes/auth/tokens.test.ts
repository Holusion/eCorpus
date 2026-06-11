
import request from "supertest";

import User from "../../auth/User.js";
import UserManager from "../../auth/UserManager.js";
import Vfs from "../../vfs/index.js";


describe("/auth/tokens", function(){
  let vfs: Vfs, userManager :UserManager, user :User, admin :User;

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

  async function login(server: any, u: User){
    const agent = request.agent(server);
    await agent.post("/auth/login")
      .send({username: u.username, password: "12345678"})
      .set("Content-Type", "application/json")
      .set("Accept", "")
      .expect(200);
    return agent;
  }

  describe("POST /auth/tokens", function(){
    it("requires authentication", async function(){
      await request(this.server).post("/auth/tokens")
        .send({name: "test"})
        .expect(401);
    });

    it("creates a token, shown exactly once", async function(){
      const agent = await login(this.server, user);
      const res = await agent.post("/auth/tokens")
        .send({name: "my service"})
        .expect(201);
      expect(res.body).to.have.property("token").match(/^ecorpus_/);
      expect(res.body).to.have.property("name", "my service");
      expect(res.body).to.have.property("scope").deep.equal(["all"]);

      //The token authenticates requests as the user, at the user's own level
      await request(this.server).get("/auth/")
        .set("Authorization", `Bearer ${res.body.token}`)
        .set("Accept", "application/json")
        .expect(200)
        .expect({uid: user.uid, username: user.username, level: user.level});

      //Listing never returns the credential again
      const list = await agent.get("/auth/tokens").expect(200);
      expect(list.body).to.have.length(1);
      expect(list.body[0]).not.to.have.property("token");
      expect(list.body[0]).not.to.have.property("hash");
    });

    it("rejects invalid scopes", async function(){
      const agent = await login(this.server, user);
      await agent.post("/auth/tokens").send({name: "test", scope: ["banana"]}).expect(400);
      await agent.post("/auth/tokens").send({name: "test", scope: []}).expect(400);
      //User-level names are not scopes
      await agent.post("/auth/tokens").send({name: "test", scope: ["use"]}).expect(400);
      await agent.post("/auth/tokens").send({name: "test", scope: ["admin"]}).expect(400);
    });

    it("requires a name", async function(){
      const agent = await login(this.server, user);
      await agent.post("/auth/tokens").send({scope: ["use"]}).expect(400);
    });

    it("tokens can not mint other tokens", async function(){
      const res = await request(this.server).post("/auth/tokens")
        .set("Authorization", await bearer(user.username))
        .send({name: "sneaky"})
        .expect(403);
      expect(res.body).to.have.property("message").match(/Tokens can not be used/);
    });
  });

  describe(`the "all" scope grants exactly the owner's session rights`, function(){
    it("an admin's token administrates", async function(){
      const agent = await login(this.server, admin);
      const res = await agent.post("/auth/tokens")
        .send({name: "automation"})
        .expect(201);
      await request(this.server).get("/users/")
        .set("Authorization", `Bearer ${res.body.token}`)
        .expect(200);
    });

    it("demoting the owner instantly degrades the token", async function(){
      const agent = await login(this.server, admin);
      const res = await agent.post("/auth/tokens")
        .send({name: "admin token"})
        .expect(201);
      await request(this.server).get("/users/")
        .set("Authorization", `Bearer ${res.body.token}`)
        .expect(200);
      await userManager.patchUser(admin.uid, {level: "use"});
      await request(this.server).get("/users/")
        .set("Authorization", `Bearer ${res.body.token}`)
        .expect(401);
    });

    it("per-scene grants apply to tokens like they do to sessions", async function(){
      //A private scene the user was explicitly granted access to
      await vfs.createScene("private", user.uid);
      await vfs.writeDoc("{}", {scene: "private", user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
      await userManager.setPublicAccess("private", "none");
      await userManager.setDefaultAccess("private", "none");
      await userManager.grant("private", user.username, "read");

      const token = await bearer(user.username);
      await request(this.server).get("/scenes/private")
        .set("Authorization", token)
        .expect(200);
      //Admin tokens bypass ACLs like admin users do
      await request(this.server).get("/scenes/private")
        .set("Authorization", await bearer(admin.username))
        .expect(200);
      //Other users' tokens see nothing
      const other = await userManager.addUser("oscar", "12345678");
      await request(this.server).get("/scenes/private")
        .set("Authorization", await bearer(other.username))
        .expect(404);
    });
  });

  describe("revocation and expiry", function(){
    it("DELETE /auth/tokens/:id revokes one's own token", async function(){
      const agent = await login(this.server, user);
      const res = await agent.post("/auth/tokens").send({name: "test"}).expect(201);
      await request(this.server).get("/auth/")
        .set("Authorization", `Bearer ${res.body.token}`)
        .expect(200);
      await agent.delete(`/auth/tokens/${res.body.id}`).expect(204);
      await request(this.server).get("/auth/")
        .set("Authorization", `Bearer ${res.body.token}`)
        .expect(401);
    });

    it("can't revoke another user's token", async function(){
      const agent = await login(this.server, user);
      const adminAgent = await login(this.server, admin);
      const res = await adminAgent.post("/auth/tokens").send({name: "test"}).expect(201);
      await agent.delete(`/auth/tokens/${res.body.id}`).expect(404);
    });

    it("expired tokens are rejected", async function(){
      const agent = await login(this.server, user);
      const res = await agent.post("/auth/tokens")
        .send({name: "test", expires: new Date(Date.now() - 1000).toISOString()})
        .expect(201);
      const r = await request(this.server).get("/auth/")
        .set("Authorization", `Bearer ${res.body.token}`)
        .expect(401);
      expect(r.body).to.have.property("message").match(/Token expired/);
    });

    it("deleting the owner revokes the token", async function(){
      const token = await bearer(user.username);
      await request(this.server).get("/auth/").set("Authorization", token).expect(200);
      await userManager.removeUser(user.uid);
      await request(this.server).get("/auth/").set("Authorization", token).expect(401);
    });
  });

  describe("admin inventory", function(){
    it("GET /users/:uid/tokens lists any user's tokens", async function(){
      const agent = await login(this.server, user);
      await agent.post("/auth/tokens").send({name: "test"}).expect(201);
      const adminAgent = await login(this.server, admin);
      const res = await adminAgent.get(`/users/${user.uid}/tokens`).expect(200);
      expect(res.body).to.have.length(1);
      expect(res.body[0]).to.have.property("name", "test");
      //Not as a regular user
      await agent.get(`/users/${admin.uid}/tokens`).expect(401);
    });

    it("DELETE /users/:uid/tokens/:id revokes any user's token", async function(){
      const agent = await login(this.server, user);
      const created = await agent.post("/auth/tokens").send({name: "test"}).expect(201);
      const adminAgent = await login(this.server, admin);
      await adminAgent.delete(`/users/${user.uid}/tokens/${created.body.id}`).expect(204);
      await request(this.server).get("/auth/")
        .set("Authorization", `Bearer ${created.body.token}`)
        .expect(401);
    });
  });
});

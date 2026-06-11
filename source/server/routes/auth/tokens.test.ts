
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

  describe("scenes:* scopes cap per-scene access", function(){
    this.beforeEach(async function(){
      //A private scene: only its owner (and admins) can see it
      await vfs.createScene("private", user.uid);
      await vfs.writeDoc("{}", {scene: "private", user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
      await userManager.setPublicAccess("private", "none");
      await userManager.setDefaultAccess("private", "none");
    });

    async function scopedBearer(server: any, u: User, scope: string[]){
      const agent = await login(server, u);
      const res = await agent.post("/auth/tokens").send({name: "scoped", scope}).expect(201);
      expect(res.body).to.have.property("scope").deep.equal(scope);
      return `Bearer ${res.body.token}`;
    }

    it("caps the access level, never the visibility", async function(){
      //An admin's scenes:read token reads every scene the admin usually sees — read-only
      const auth = await scopedBearer(this.server, admin, ["scenes:read"]);
      await request(this.server).get("/scenes/private")
        .set("Authorization", auth)
        .expect(200);
      //Writes are rejected as insufficient rights (401), not hidden (404)
      await request(this.server).put("/scenes/private/articles/foo.html")
        .set("Authorization", auth)
        .set("Content-Type", "text/html")
        .expect(401);
      await request(this.server).patch("/auth/access/private")
        .set("Authorization", auth)
        .set("Content-Type", "application/json")
        .send({username: user.username, access: "read"})
        .expect(401);
    });

    it("scenes:write allows writes but no permission changes", async function(){
      const auth = await scopedBearer(this.server, user, ["scenes:write"]);
      await request(this.server).put("/scenes/private/articles/foo.html")
        .set("Authorization", auth)
        .set("Content-Type", "text/html")
        .expect(201);
      await request(this.server).patch("/auth/access/private")
        .set("Authorization", auth)
        .set("Content-Type", "application/json")
        .send({username: admin.username, access: "read"})
        .expect(401);
    });

    it("scenes:admin grants full scene control", async function(){
      const auth = await scopedBearer(this.server, user, ["scenes:admin"]);
      await request(this.server).patch("/auth/access/private")
        .set("Authorization", auth)
        .set("Content-Type", "application/json")
        .send({username: admin.username, access: "read"})
        .expect(204);
    });

    it("never extends what the owner can do", async function(){
      //No access to the scene: a scenes:write token doesn't even see it
      const other = await userManager.addUser("oscar", "12345678");
      const auth = await scopedBearer(this.server, other, ["scenes:write"]);
      await request(this.server).get("/scenes/private")
        .set("Authorization", auth)
        .expect(404);
      await request(this.server).put("/scenes/private/articles/foo.html")
        .set("Authorization", auth)
        .set("Content-Type", "text/html")
        .expect(404);
    });

    it("denies everything outside the granted families (deny-by-default)", async function(){
      //A token grants only what its scopes name: however privileged its owner,
      //a scenes:* token fails every level-based guard and account management.
      const auth = await scopedBearer(this.server, admin, ["scenes:admin"]);
      //User administration (isAdministrator)
      await request(this.server).get("/users/")
        .set("Authorization", auth)
        .expect(401);
      //Scene creation (isCreator): creation is not named by scenes:*
      await request(this.server).mkcol("/scenes/newscene")
        .set("Authorization", auth)
        .expect(401);
      //Groups (isManage)
      await request(this.server).get("/groups/")
        .set("Authorization", auth)
        .expect(401);
      //Tasks
      await request(this.server).get("/tasks/")
        .set("Authorization", auth)
        .expect(401);
      //Admin pages
      await request(this.server).get("/admin/stats")
        .set("Authorization", auth)
        .expect(401);
    });

    it("denies account management (session/token escalation)", async function(){
      const auth = await scopedBearer(this.server, admin, ["scenes:admin"]);
      //Inspecting or revoking credentials
      await request(this.server).get("/auth/sessions")
        .set("Authorization", auth)
        .expect(401);
      await request(this.server).get("/auth/tokens")
        .set("Authorization", auth)
        .expect(401);
      await request(this.server).post("/auth/tokens")
        .set("Authorization", auth)
        .send({name: "sneaky"})
        .expect(401);
      //Changing the owner's password would escalate back to full authority
      await request(this.server).patch(`/users/${admin.uid}`)
        .set("Authorization", auth)
        .set("Content-Type", "application/json")
        .send({password: "hijacked1"})
        .expect(401);
    });

    it("keeps the identity endpoint available", async function(){
      //The packaging use case: "does this user exist, at what level"
      const auth = await scopedBearer(this.server, admin, ["scenes:read"]);
      await request(this.server).get("/auth/")
        .set("Authorization", auth)
        .set("Accept", "application/json")
        .expect(200)
        .expect({uid: admin.uid, username: admin.username, level: admin.level});
    });

    it("caps scene tagging like a write", async function(){
      const writeAuth = await scopedBearer(this.server, user, ["scenes:write"]);
      await request(this.server).patch("/tags/")
        .set("Authorization", writeAuth)
        .set("Content-Type", "application/json")
        .send({name: "mytag", scene: "private", action: "create"})
        .expect(200);
      //read cap: the scene stays visible, the write is refused
      const readAuth = await scopedBearer(this.server, user, ["scenes:read"]);
      await request(this.server).patch("/tags/")
        .set("Authorization", readAuth)
        .set("Content-Type", "application/json")
        .send({name: "othertag", scene: "private", action: "create"})
        .expect(403);
    });
  });

  describe("granular grants (scenes:create, tasks:*)", function(){
    async function scopedBearer(server: any, u: User, scope: string[]){
      const agent = await login(server, u);
      const res = await agent.post("/auth/tokens").send({name: "scoped", scope}).expect(201);
      return `Bearer ${res.body.token}`;
    }

    it("scenes:create grants scene creation", async function(){
      const auth = await scopedBearer(this.server, user, ["scenes:create", "scenes:write"]);
      await request(this.server).mkcol("/scenes/fresh")
        .set("Authorization", auth)
        .expect(201);
      //scenes:write then covers populating it (the owner authored it)
      await request(this.server).put("/scenes/fresh/articles/foo.html")
        .set("Authorization", auth)
        .set("Content-Type", "text/html")
        .expect(201);
      //Without the grant, creation stays denied — even for an admin's token
      const reader = await scopedBearer(this.server, admin, ["scenes:admin"]);
      await request(this.server).mkcol("/scenes/other")
        .set("Authorization", reader)
        .expect(401);
    });

    it("scenes:create grants the zip import endpoint", async function(){
      const auth = await scopedBearer(this.server, user, ["scenes:create"]);
      //Past the guard: fails on the missing file headers (400), not on authorization
      await request(this.server).post("/scenes/")
        .set("Authorization", auth)
        .expect(400);
      const reader = await scopedBearer(this.server, user, ["scenes:read"]);
      await request(this.server).post("/scenes/")
        .set("Authorization", reader)
        .expect(401);
    });

    it("tasks:read grants task inspection, not creation", async function(){
      const auth = await scopedBearer(this.server, user, ["tasks:read"]);
      //Past the guard: the task simply doesn't exist
      await request(this.server).get("/tasks/999999")
        .set("Authorization", auth)
        .expect(404);
      await request(this.server).post("/tasks/")
        .set("Authorization", auth)
        .set("Content-Type", "application/json")
        .send({})
        .expect(401);
    });

    it("tasks:write grants task creation", async function(){
      const auth = await scopedBearer(this.server, user, ["tasks:write"]);
      //Past the guard: fails on the empty body (400), not on authorization
      await request(this.server).post("/tasks/")
        .set("Authorization", auth)
        .set("Content-Type", "application/json")
        .send({})
        .expect(400);
    });

    it("user level still applies (scopes never extend)", async function(){
      //A "use"-level user can't create scenes, however scoped their token
      const limited = await userManager.addUser("uma", "12345678", "use");
      const auth = await scopedBearer(this.server, limited, ["scenes:create"]);
      await request(this.server).mkcol("/scenes/nope")
        .set("Authorization", auth)
        .expect(401);
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

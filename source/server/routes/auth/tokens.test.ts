
import request from "supertest";

import User from "../../auth/User.js";
import UserManager from "../../auth/UserManager.js";
import Vfs from "../../vfs/index.js";
import { TaskScheduler } from "../../tasks/scheduler.js";


describe("/auth/tokens", function(){
  let vfs: Vfs, userManager :UserManager, taskScheduler :TaskScheduler, user :User, admin :User;

  this.beforeAll(async function(){
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager = locals.userManager;
    taskScheduler = locals.taskScheduler;
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
      expect(res.body).to.have.property("token").match(/^ec_/);
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

    it("honors an explicit expiry and echoes the token's metadata", async function(){
      const agent = await login(this.server, user);
      const expires = new Date(Date.now() + 7*24*3600*1000).toISOString();
      const res = await agent.post("/auth/tokens").send({name: "expiring", expires}).expect(201);
      expect(res.body).to.have.property("expires", expires);
      //A personal token (not minted through an OAuth client) reports no client.
      expect(res.body).to.have.property("client", null);
      expect(res.body).to.have.property("lastUsed", null);
    });

    it("rejects an invalid expiry", async function(){
      const agent = await login(this.server, user);
      await agent.post("/auth/tokens").send({name: "bad", expires: "not-a-date"}).expect(400);
    });

    it("tokens can not mint other tokens", async function(){
      const res = await request(this.server).post("/auth/tokens")
        .set("Authorization", await bearer(user.username))
        .send({name: "sneaky"})
        .expect(403);
      //account:admin is non-mintable, so an all-scoped token still can't mint.
      expect(res.body).to.have.property("message").match(/insufficient_scope/);
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

    it("an all token cannot change its owner's password", async function(){
      //Rotating the password would convert the token into a session (whose
      //account:admin authority can then mint tokens, outliving revocation):
      //PATCH /users/:uid requires the non-mintable account:admin.
      const res = await request(this.server).patch(`/users/${user.uid}`)
        .set("Authorization", await bearer(user.username))
        .set("Content-Type", "application/json")
        .send({password: "hijacked1"})
        .expect(403);
      expect(res.body).to.have.property("message").match(/insufficient_scope/);
      //The password (and with it, every session) is untouched
      await login(this.server, user);
    });

    it("an all token cannot obtain a login link", async function(){
      //A login link is a session for whoever holds it: users:admin is
      //non-mintable, so even an admin's all token gets insufficient_scope.
      await request(this.server).get(`/auth/login/${user.username}/link`)
        .set("Authorization", await bearer(admin.username))
        .expect(403);
      //The admin's own session still may
      const agent = await login(this.server, admin);
      await agent.get(`/auth/login/${user.username}/link`).expect(200);
    });

    it("an all token cannot create an administrator", async function(){
      //Provisioning regular users over a token is allowed (users:write)…
      await request(this.server).post("/users/")
        .set("Authorization", await bearer(admin.username))
        .set("Content-Type", "application/json")
        .send({username: "imported", password: "12345678", email: "imported@example.com", level: "create"})
        .expect(201);
      //…but a fresh admin with a known password would be a sign-in-able
      //backdoor: that needs the non-mintable users:admin (a session).
      await request(this.server).post("/users/")
        .set("Authorization", await bearer(admin.username))
        .set("Content-Type", "application/json")
        .send({username: "backdoor", password: "12345678", email: "backdoor@example.com", level: "admin"})
        .expect(403);
      const agent = await login(this.server, admin);
      await agent.post("/users/")
        .set("Content-Type", "application/json")
        .send({username: "colleague", password: "12345678", email: "colleague@example.com", level: "admin"})
        .expect(201);
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
      //Writes are rejected as insufficient_scope (403), not hidden (404): the
      //credential can read scenes but wasn't delegated scenes:write.
      await request(this.server).put("/scenes/private/articles/foo.html")
        .set("Authorization", auth)
        .set("Content-Type", "text/html")
        .expect(403);
      //Permission changes need scenes:admin: insufficient_scope (403), like the
      //scene/task routes (was 401 while /auth/access still used canAdmin).
      await request(this.server).patch("/auth/access/private")
        .set("Authorization", auth)
        .set("Content-Type", "application/json")
        .send({username: user.username, access: "read"})
        .expect(403);
    });

    it("scenes:write allows writes but no permission changes", async function(){
      const auth = await scopedBearer(this.server, user, ["scenes:write"]);
      await request(this.server).put("/scenes/private/articles/foo.html")
        .set("Authorization", auth)
        .set("Content-Type", "text/html")
        .expect(201);
      //scenes:write lacks scenes:admin → 403 insufficient_scope.
      await request(this.server).patch("/auth/access/private")
        .set("Authorization", auth)
        .set("Content-Type", "application/json")
        .send({username: admin.username, access: "read"})
        .expect(403);
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
      //A token grants only what its scopes name: every API family answers
      //403 insufficient_scope (the account could, the credential can't) —
      //a scenes:* token reaches none of these.
      const auth = await scopedBearer(this.server, admin, ["scenes:admin"]);
      //User administration (users:read scope)
      await request(this.server).get("/users/")
        .set("Authorization", auth)
        .expect(403);
      //Scene creation (corpus:write scope): a different family than scenes:admin
      await request(this.server).mkcol("/scenes/newscene")
        .set("Authorization", auth)
        .expect(403);
      //Groups (groups:read scope)
      await request(this.server).get("/groups/")
        .set("Authorization", auth)
        .expect(403);
      //Tasks (task creation needs the tasks:write scope)
      await request(this.server).post("/tasks/")
        .set("Authorization", auth)
        .expect(403);
      //Instance administration (instance:read scope)
      await request(this.server).get("/admin/stats")
        .set("Authorization", auth)
        .expect(403);
    });

    it("denies account management (session/token escalation)", async function(){
      const auth = await scopedBearer(this.server, admin, ["scenes:admin"]);
      //Inspecting or revoking credentials needs account:read/write; minting
      //needs account:admin — none of which a scenes:* token carries (403).
      await request(this.server).get("/auth/sessions")
        .set("Authorization", auth)
        .expect(403);
      await request(this.server).get("/auth/tokens")
        .set("Authorization", auth)
        .expect(403);
      await request(this.server).post("/auth/tokens")
        .set("Authorization", auth)
        .send({name: "sneaky"})
        .expect(403);
      //Changing the owner's password would escalate back to full authority
      await request(this.server).patch(`/users/${admin.uid}`)
        .set("Authorization", auth)
        .set("Content-Type", "application/json")
        .send({password: "hijacked1"})
        .expect(403);
    });

    it("every token carries the implicit corpus:read baseline", async function(){
      //Routes gated on corpus:read mean "any identified requester": a narrowly
      //scoped token passes that gate (here: reading a scene's ACL), subject to
      //the route's other checks — anonymous does not.
      await request(this.server).get("/auth/access/private")
        .set("Authorization", await scopedBearer(this.server, user, ["scenes:read"]))
        .expect(200);
      //The baseline grants identity, not content: without scenes:read the
      //same route still refuses the scene ACL part.
      await request(this.server).get("/auth/access/private")
        .set("Authorization", await scopedBearer(this.server, user, ["tasks:read"]))
        .expect(403);
      await request(this.server).get("/auth/access/private")
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

  describe("granular grants (corpus:write, tasks:*)", function(){
    async function scopedBearer(server: any, u: User, scope: string[]){
      const agent = await login(server, u);
      const res = await agent.post("/auth/tokens").send({name: "scoped", scope}).expect(201);
      return `Bearer ${res.body.token}`;
    }

    it("corpus:write grants scene creation", async function(){
      const auth = await scopedBearer(this.server, user, ["corpus:write", "scenes:write"]);
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
        .expect(403);
    });

    it("the zip import endpoint requires corpus:write AND scenes:write", async function(){
      //Import both creates scenes and overwrites existing ones the user has
      //write ACL on: the credential must prove both up front, since the
      //detached extraction task can't consult it afterwards.
      const auth = await scopedBearer(this.server, user, ["corpus:write", "scenes:write"]);
      //Past the guard: fails on the missing file headers (400), not on authorization
      await request(this.server).post("/scenes/")
        .set("Authorization", auth)
        .expect(400);
      //Either scope alone is refused
      await request(this.server).post("/scenes/")
        .set("Authorization", await scopedBearer(this.server, user, ["corpus:write"]))
        .expect(403);
      await request(this.server).post("/scenes/")
        .set("Authorization", await scopedBearer(this.server, user, ["scenes:write"]))
        .expect(403);
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
        .expect(403);
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

    it("task deletion needs tasks:admin, not just tasks:write", async function(){
      //The tasks family follows the standard read<write<admin ladder: deleting
      //(or overwriting the artifact of) a task is its admin rung.
      const task = await taskScheduler.create({scene_id: null, user_id: user.uid, type: "test", data: {}});
      await request(this.server).delete(`/tasks/${task.task_id}`)
        .set("Authorization", await scopedBearer(this.server, user, ["tasks:write"]))
        .expect(403);
      await request(this.server).delete(`/tasks/${task.task_id}`)
        .set("Authorization", await scopedBearer(this.server, user, ["tasks:admin"]))
        .expect(204);
    });

    it("user level still applies (scopes never extend)", async function(){
      //A "use"-level user can't create scenes, however scoped their token
      const limited = await userManager.addUser("uma", "12345678", "use");
      const auth = await scopedBearer(this.server, limited, ["corpus:write"]);
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

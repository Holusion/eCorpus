
import request from "supertest";

import User from "../../auth/User.js";
import UserManager from "../../auth/UserManager.js";


describe("/auth/sessions", function(){
  let userManager :UserManager, user :User, admin :User;

  this.beforeAll(async function(){
    let locals = await createIntegrationContext(this);
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

  describe("GET /auth/sessions", function(){
    it("requires authentication", async function(){
      await request(this.server).get("/auth/sessions").expect(401);
    });

    it("lists own sessions, without credentials", async function(){
      const agent = await login(this.server, user);
      await login(this.server, user); //a second session, eg. another browser
      const res = await agent.get("/auth/sessions")
        .set("Accept", "application/json")
        .expect(200);
      expect(res.body).to.have.length(2);
      for(const s of res.body){
        expect(s).to.have.property("id").a("number");
        expect(s).to.have.property("uid", user.uid);
        expect(s).to.have.property("created").a("string");
        expect(s).to.have.property("expires").a("string");
        expect(Object.keys(s)).not.to.include.any.members(["sid", "sid_hash", "hash"]);
      }
    });

    it("does not list other users' sessions", async function(){
      await login(this.server, admin);
      const agent = await login(this.server, user);
      const res = await agent.get("/auth/sessions")
        .set("Accept", "application/json")
        .expect(200);
      expect(res.body).to.have.length(1);
    });
  });

  describe("DELETE /auth/sessions/:id", function(){
    it("revokes one of one's own sessions", async function(){
      const agent = await login(this.server, user);
      const victim = await login(this.server, user);
      const sessions = await userManager.getSessions(user.uid);
      //agent's own session is the oldest: revoke the other one
      const target = sessions.find(s => s.id !== sessions.reduce((min, x) => x.id < min.id ? x : min).id)!;
      await agent.delete(`/auth/sessions/${target.id}`).expect(204);
      await victim.get("/auth/").set("Accept", "application/json").expect(401);
      //our own session is untouched
      await agent.get("/auth/").set("Accept", "application/json").expect(200);
    });

    it("can't revoke another user's session", async function(){
      const agent = await login(this.server, user);
      await login(this.server, admin);
      const [target] = await userManager.getSessions(admin.uid);
      await agent.delete(`/auth/sessions/${target.id}`).expect(404);
    });

    it("administrators can revoke anyone's session", async function(){
      const agent = await login(this.server, admin);
      const victim = await login(this.server, user);
      const [target] = await userManager.getSessions(user.uid);
      await agent.delete(`/auth/sessions/${target.id}`).expect(204);
      await victim.get("/auth/").set("Accept", "application/json").expect(401);
    });
  });

  describe("GET /users/:uid/sessions", function(){
    it("requires administrative rights", async function(){
      const agent = await login(this.server, user);
      await agent.get(`/users/${user.uid}/sessions`).expect(401);
    });

    it("lists any user's sessions", async function(){
      await login(this.server, user);
      const agent = await login(this.server, admin);
      const res = await agent.get(`/users/${user.uid}/sessions`)
        .set("Accept", "application/json")
        .expect(200);
      expect(res.body).to.have.length(1);
      expect(res.body[0]).to.have.property("uid", user.uid);
    });
  });
});

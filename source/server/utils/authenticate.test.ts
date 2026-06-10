
import request from "supertest";

import User from "../auth/User.js";
import UserManager from "../auth/UserManager.js";
import { AppLocals } from "./locals.js";


describe("authenticate middleware (server-side sessions)", function(){
  let userManager :UserManager, user :User, admin :User;
  let _maxAge: number;

  this.beforeAll(async function(){
    let locals = await createIntegrationContext(this);
    userManager = locals.userManager;
    _maxAge = locals.sessionMaxAge;
  });

  this.beforeEach(async function(){
    await resetIntegrationContext(this);
    this.server.locals.sessionMaxAge = _maxAge;
    user = await userManager.addUser("bob", "12345678");
    admin = await userManager.addUser("alice", "12345678", "admin");
  });

  async function login(server: any, u: User = user){
    const agent = request.agent(server);
    await agent.post("/auth/login")
      .send({username: u.username, password: "12345678"})
      .set("Content-Type", "application/json")
      .set("Accept", "")
      .expect(200);
    return agent;
  }

  describe("session cookie", function(){
    it("carries only an opaque sid, no identity claims", async function(){
      const res = await request(this.server).post("/auth/login")
        .send({username: user.username, password: "12345678"})
        .set("Content-Type", "application/json")
        .set("Accept", "")
        .expect(200);
      const cookie = /session=([^;]+);/.exec(res.headers["set-cookie"]?.toString());
      expect(cookie, "expected a session cookie").to.be.ok;
      const payload = JSON.parse(Buffer.from((cookie as any)[1], "base64").toString("utf-8"));
      expect(payload).to.have.property("sid").a("string").with.length.above(32);
      expect(payload).to.have.property("expires").a("number");
      expect(payload).not.to.have.any.keys("uid", "username", "level", "email");
    });

    it("is not re-emitted on every request", async function(){
      const agent = await login(this.server);
      const res = await agent.get("/auth/")
        .set("Accept", "application/json")
        .expect(200);
      expect(res.headers).not.to.have.property("set-cookie");
    });

    it("is renewed when less than 66% of its lifetime remains", async function(){
      const agent = await login(this.server);
      //Stretch the configured lifetime so the session now sits under the renewal threshold
      (this.server.locals as AppLocals).sessionMaxAge = _maxAge * 4;
      const res = await agent.get("/auth/")
        .set("Accept", "application/json")
        .expect(200);
      expect(res.headers).to.have.property("set-cookie");
      //The renewed session keeps working
      await agent.get("/auth/").set("Accept", "application/json").expect(200);
    });
  });

  describe("server-side state", function(){
    it("resolves identity from the database", async function(){
      const agent = await login(this.server);
      const res = await agent.get("/auth/")
        .set("Accept", "application/json")
        .expect(200);
      expect(res.body).to.deep.equal({uid: user.uid, username: user.username, level: "create"});
    });

    it("level changes apply to live sessions", async function(){
      const agent = await login(this.server);
      await userManager.patchUser(user.uid, {level: "use"});
      const res = await agent.get("/auth/")
        .set("Accept", "application/json")
        .expect(200);
      expect(res.body).to.have.property("level", "use");
    });

    it("revocation applies to live sessions", async function(){
      const agent = await login(this.server);
      await userManager.removeUserSessions(user.uid);
      await agent.get("/auth/")
        .set("Accept", "application/json")
        .expect(401);
    });

    it("a password change evicts every session", async function(){
      const agent = await login(this.server);
      const otherAgent = await login(this.server);
      await userManager.patchUser(user.uid, {password: "abcdefgh"});
      await agent.get("/auth/").set("Accept", "application/json").expect(401);
      await otherAgent.get("/auth/").set("Accept", "application/json").expect(401);
    });

    it("expired sessions are rejected and cleaned up", async function(){
      (this.server.locals as AppLocals).sessionMaxAge = -1;
      const agent = request.agent(this.server);
      await agent.post("/auth/login")
        .send({username: user.username, password: "12345678"})
        .set("Content-Type", "application/json")
        .set("Accept", "")
        .expect(200);
      const res = await agent.get("/auth/")
        .set("Accept", "application/json")
        .expect(401);
      expect(res.body).to.have.property("message").match(/Session Token expired/);
      expect(await userManager.getSessions(user.uid)).to.have.length(0);
    });

    it("logout revokes the server-side session", async function(){
      const agent = await login(this.server);
      expect(await userManager.getSessions(user.uid)).to.have.length(1);
      await agent.post("/auth/logout").expect(200);
      expect(await userManager.getSessions(user.uid)).to.have.length(0);
    });
  });

  describe("header authentication is request-scoped", function(){
    it("authenticates with Basic and mints no cookie", async function(){
      const res = await request(this.server).get("/auth/")
        .auth(admin.username, "12345678")
        .set("Accept", "application/json")
        .expect(200);
      expect(res.body).to.have.property("username", admin.username);
      expect(res.headers, "header auth must never mint a session cookie").not.to.have.property("set-cookie");
    });
  });
});

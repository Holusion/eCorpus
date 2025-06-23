
import request from "supertest";
import Vfs from "../../vfs/index.js";
import User, { UserLevels, UserRoles } from "../../auth/User.js";
import UserManager from "../../auth/UserManager.js";
import { AppLocals } from "../../utils/locals.js";



describe("/auth/login", function(){
  let vfs :Vfs, userManager :UserManager, user :User, admin :User;
  this.beforeEach(async function(){
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager = locals.userManager;
    user = await userManager.addUser("bob", "12345678");
    admin = await userManager.addUser("alice", "12345678", "admin");
  });
  this.afterEach(async function(){
    await cleanIntegrationContext(this);
  });

  it("sets a cookie", async function(){
    const maxAge = this.server.locals.sessionMaxAge;
    this.agent = request.agent(this.server);
    let res = await this.agent.post("/auth/login")
    .send({username: user.username, password: "12345678"})
    .set("Content-Type", "application/json")
    .set("Accept", "")
    .expect(200)
    .expect('set-cookie', /session=/);

    let expiresText = /expires=([^;]+);/.exec(res.headers["set-cookie"]);
    expect(expiresText, `expected regex to match ${res.headers["set-cookie"]}`).to.be.ok;
    let expiresDate = new Date((expiresText as any)[1]);
    expect(expiresDate.valueOf()).to.be.above(Date.now()+maxAge-2000);
    expect(expiresDate.valueOf()).to.be.below(Date.now()+ maxAge + 1);
  });

  it("can get login status (not connected)", async function(){
    await request(this.server).get("/auth/login")
    .set("Accept", "application/json")
    .expect(200)
    .expect({uid: 0, username: "default", level: "none"});
  });
  
  it("can get login status (connected)", async function(){
    this.agent = request.agent(this.server);
    await this.agent.post("/auth/login")
    .send({username: user.username, password: "12345678"})
    .set("Content-Type", "application/json")
    .set("Accept", "")
    .expect(200);
    await this.agent.get("/auth/login")
    .set("Accept", "application/json")
    .expect(200)
    .expect({
      username: user.username, 
      uid: user.uid,
      level: "create",
    });
  });

  it("can get login status (admin)", async function(){
    this.agent = request.agent(this.server);
    await this.agent.post("/auth/login")
    .send({username: admin.username, password: "12345678"})
    .set("Content-Type", "application/json")
    .set("Accept", "")
    .expect(200);
    await this.agent.get("/auth/login")
    .set("Accept", "application/json")
    .expect(200)
    .expect({
      username: admin.username, 
      uid: admin.uid,
      level: "admin"
    });
  });

  it("expires sessions", async function(){
    (this.server.locals as AppLocals).sessionMaxAge = -1;
    this.agent = request.agent(this.server);
    await this.agent.post("/auth/login")
    .send({username: user.username, password: "12345678"})
    .set("Content-Type", "application/json")
    .set("Accept", "")
    .expect(200);

    await this.agent.get("/auth/login")
    .set("Accept", "application/json")
    .expect(401)
    .expect({
      code: 401,
      message: "Error: [401] Session Token expired. Please reauthenticate"
    });
  });

  it("send a proper error if username is missing", async function(){
    this.agent = request.agent(this.server);
    let res = await this.agent.post("/auth/login")
    .send({/*no username */ password: "12345678"})
    .set("Content-Type", "application/json")
    .set("Accept", "")
    .expect(400);
    expect(res.body).to.have.property("message").match(/username not provided/i);
  });

  it("send a proper error if password is missing", async function(){
    this.agent = request.agent(this.server);
    let res = await this.agent.post("/auth/login")
    .send({username: user.username /*no password */})
    .set("Content-Type", "application/json")
    .set("Accept", "")
    .expect(400);
    expect(res.body).to.have.property("message").match(/password not provided/i);
  });

  it("send a proper error if form is malformed", async function(){
    this.agent = request.agent(this.server);
    let res = await this.agent.post("/auth/login")
    .send({username:["foo", "bar"], password: "12345678"})
    .set("Content-Type", "application/json")
    .set("Accept", "")
    .expect(400);
    expect(res.body).to.have.property("message").match(/Bad username format/i);
  });
  
  it("can logout", async function(){
    let agent = request.agent(this.server);
    await agent.post("/auth/login")
    .send({username: user.username, password: "12345678"})
    .set("Content-Type", "application/json")
    .set("Accept", "")
    .expect(200)
    .expect('set-cookie', /session=/);

    await agent.post("/auth/logout")
    .expect(200);

    await agent.get("/auth/login")
    .expect(200)
    .expect({
      uid: 0,
      username: "default",
      level: "none",
    });
  });

  it("accepts a redirect parameter", async function(){
    let s = new URLSearchParams();
    s.set("redirect", "/ui/")
    let agent = request.agent(this.server);
    await agent.post("/auth/login?"+s.toString())
    .send({username: user.username, password: "12345678"})
    .set("Content-Type", "application/json")
    .set("Accept", "")
    .expect(302)
    .expect('set-cookie', /session=/)
    .expect("Location", /\/ui\/$/);
  });

  it("validates the redirect parameter", async function(){
    let s = new URLSearchParams();
    s.set("redirect", "https://example.com/foo")
    let agent = request.agent(this.server);
    await agent.post("/auth/login?"+s.toString())
    .send({username: user.username, password: "12345678"})
    .set("Content-Type", "application/json")
    .set("Accept", "")
    .expect(400);
  });

  it("accepts application/x-www-form-urlencoded data", async function(){
    let agent = request.agent(this.server);
    await agent.post("/auth/login")
    .set("Content-Type", "application/x-www-form-urlencoded")
    .send(`username=${user.username}&password=12345678`)
    .expect(200);
  });
  
  describe("Authorization header", function(){
    it("can use header to authenticate a request", async function(){
      let res = {
        username: user.username, 
        uid: user.uid,
        level: "create",
      };

      //Manually build the header
      await request(this.server).get("/auth/login")
      .set("Authorization", `Basic ${Buffer.from(`${user.username}:12345678`).toString("base64")}`)
      .set("Accept", "application/json")
      .expect(200)
      .expect(res);

      //make supertest build the header
      await request(this.server).get("/auth/login")
      .auth(user.username, "12345678")
      .set("Accept", "application/json")
      .expect(200)
      .expect(res);
    });
  
    it("rejects bad header", async function(){
      // Missing the "Basic " part
      let res = await request(this.server).get("/auth/login")
      .set("Authorization", `${Buffer.from(`${user.username}:12345678`).toString("base64")}`)
      .expect(200); //Still answers 200, but no login data

      expect(res.body).to.deep.equal({ uid: 0, username: "default", level: "none" });
    });
    it("rejects bad user:password", async function(){
      let res = await request(this.server).get("/auth/login")
      .auth(user.username, "badPassword")
      .expect(401);
      expect(res.headers).not.to.have.property("set-cookie");
    });

  });
  
  describe("Login links", function(){
    it("rejects bad login links", async function(){
      await request(this.server).get("/auth/login?payload=foo")
      .expect(400);
      await request(this.server).get("/auth/login?sig=bar")
      .expect(400);


      await request(this.server).get("/auth/login?payload=foo&sig=bar")
      .expect(403);
    });

    it("obtains a valid login link (text/plain)", async function(){
      const maxAge = this.server.locals.sessionMaxAge;
      let res = await request(this.server).get(`/auth/login/${user.username}/link`)
      .set("Authorization", `Basic ${Buffer.from(`${admin.username}:12345678`).toString("base64")}`)
      .set("Accept", "text/plain")
      .expect(200)
      .expect("Content-Type", "text/plain; charset=utf-8");

      expect(res.text).to.match(/^http:/);
      let url = new URL(res.text);

      const agent = request.agent(this.server);
      res = await agent.get(url.pathname+url.search)
      .expect(302)
      .expect("Set-Cookie", /session=/);

      expect(res.headers["location"]).to.match(/http:\/\/(?:localhost|127.0.0.1|::1):\d+\//);

      let expiresText = /expires=([^;]+);/.exec(res.headers["set-cookie"]);
      expect(expiresText, `expected regex to match ${res.headers["set-cookie"]}`).to.be.ok;
      let expiresDate = new Date((expiresText as any)[1]);
      expect(expiresDate.valueOf()).to.be.above(Date.now() + maxAge - 1000);

      //Verifies that the authentication does actually work
      res = await agent.get("/auth/login")
      .set("Accept", "application/json")
      .expect(200);
      expect(res.body).to.have.property("username", user.username);
    });

    it("obtains a valid login link (application/json)", async function(){
      let res = await request(this.server).get(`/auth/login/${user.username}/link`)
      .set("Authorization", `Basic ${Buffer.from(`${admin.username}:12345678`).toString("base64")}`)
      .set("Accept", "application/json")
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");

      expect(res.body).to.have.property("params").a("string");
      expect(res.body).to.have.property("expires").a("string");
      expect(res.body).to.have.property("sig").a("string");
      
      await request(this.server).get(`/auth/login?payload=${encodeURIComponent(res.body.params)}&sig=${res.body.sig}`)
      .expect(200)
      .expect("Set-Cookie", /session=/);
    });

    it("requires authorization", async function(){
      let res = await request(this.server).get(`/auth/login/${user.username}/link`)
      .set("Accept", "text/plain")
      .expect(401);
    });

    it("validates redirection URL", async function(){
      const maxAge = this.server.locals.sessionMaxAge;
      let res = await request(this.server).get(`/auth/login/${user.username}/link`)
      .set("Authorization", `Basic ${Buffer.from(`${admin.username}:12345678`).toString("base64")}`)
      .set("Accept", "text/plain")
      .expect(200)
      .expect("Content-Type", "text/plain; charset=utf-8");

      expect(res.text).to.match(/^http:/);
      let url = new URL(res.text);
      expect(url.searchParams.has("redirect")).to.be.true;
      url.searchParams.set("redirect", "https://example.com")

      const agent = request.agent(this.server);
      res = await agent.get(url.pathname+url.search)
      .expect(400);
    });
  });
});

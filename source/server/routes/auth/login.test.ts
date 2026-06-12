
import request from "supertest";
import Vfs from "../../vfs/index.js";
import User, { UserLevels, UserRoles } from "../../auth/User.js";
import UserManager from "../../auth/UserManager.js";
import { AppLocals } from "../../utils/locals.js";
import { formatLoginPayload, makeRedirect, parseLoginPayload } from "./login.js";
import { BadRequestError, ForbiddenError } from "../../utils/errors.js";



describe("/auth/login", function(){
  let vfs :Vfs, userManager :UserManager, user :User, admin :User;
  let _maxAge: number;
  this.beforeAll(async function(){
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager = locals.userManager;
    _maxAge = locals.sessionMaxAge;
  });

  this.beforeEach(async function(){
    await resetIntegrationContext(this);
    this.server.locals.sessionMaxAge = _maxAge;
    user = await userManager.addUser("bob", "12345678");
    admin = await userManager.addUser("alice", "12345678", "admin");
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

  it("scopes the cookie's Secure flag to the connection (not NODE_ENV)", async function(){
    //Plain HTTP: the cookie must not be Secure, or it would never round-trip.
    //This is exactly what the dockerised e2e hits against the production image.
    let res = await request(this.server).post("/auth/login")
      .send({username: user.username, password: "12345678"})
      .set("Content-Type", "application/json")
      .set("Accept", "")
      .expect(200);
    let cookies = ([] as string[]).concat(res.headers["set-cookie"]).join("; ");
    expect(cookies, `did not expect a Secure cookie over http, got ${cookies}`).not.to.match(/secure/i);

    //Behind a TLS-terminating proxy (trust proxy is on by default) the
    //forwarded protocol marks the cookie Secure.
    res = await request(this.server).post("/auth/login")
      .send({username: user.username, password: "12345678"})
      .set("Content-Type", "application/json")
      .set("Accept", "")
      .set("X-Forwarded-Proto", "https")
      .expect(200);
    cookies = ([] as string[]).concat(res.headers["set-cookie"]).join("; ");
    expect(cookies, `expected a Secure cookie behind https, got ${cookies}`).to.match(/secure/i);
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

  it("returns unauthorized status for bad password", async function(){
    this.agent = request.agent(this.server);
    const res = await this.agent.post("/auth/login")
    .send({username: user.username, password: "badPassword"})
    .set("Content-Type", "application/json")
    .set("Accept", "application/json")
    .expect(401);

    expect(res.body).to.have.property("code", 401);
    expect(res.body).to.have.property("message").match(/Bad password/i);
  });
    it("returns unauthorized status for bad password", async function(){
    this.agent = request.agent(this.server);
    const res = await this.agent.post("/auth/login")
    .send({username: "badUsername", password: "12345678"})
    .set("Content-Type", "application/json")
    .set("Accept", "application/json")
    .expect(401);

    expect(res.body).to.have.property("code", 401);
    expect(res.body).to.have.property("message").match(/Username not found/i);
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
    it("can use a Bearer token to authenticate a request", async function(){
      await request(this.server).get("/auth/login")
      .set("Authorization", await bearer(user.username))
      .set("Accept", "application/json")
      .expect(200)
      .expect({
        username: user.username,
        uid: user.uid,
        level: "create",
      });
    });

    it("ignores non-Bearer headers", async function(){
      let res = await request(this.server).get("/auth/login")
      .set("Authorization", `${Buffer.from(`${user.username}:12345678`).toString("base64")}`)
      .expect(200); //Still answers 200, but no login data

      expect(res.body).to.deep.equal({ uid: 0, username: "default", level: "none" });
    });

    it("does not support Basic (user password) authentication", async function(){
      //Services authenticate with revocable tokens, never with the user's password
      let res = await request(this.server).get("/auth/login")
      .auth(user.username, "12345678")
      .expect(200); //Basic is simply ignored: no login data
      expect(res.body).to.deep.equal({ uid: 0, username: "default", level: "none" });
      expect(res.headers).not.to.have.property("set-cookie");
    });

    it("rejects invalid tokens", async function(){
      let res = await request(this.server).get("/auth/login")
      .set("Authorization", `Bearer ecorpus_AAAAAAAA_${Buffer.alloc(32).toString("base64url")}`)
      .expect(401);
      expect(res.headers).not.to.have.property("set-cookie");
    });

    it("rejects malformed tokens", async function(){
      await request(this.server).get("/auth/login")
      .set("Authorization", `Bearer not-a-token`)
      .expect(401);
    });
  });
  
  describe("Login links", function(){
    
    it("rejects bad login links", async function(){
      await request(this.server).get("/auth/payload/foo")
      .expect(400);

      await request(this.server).get("/auth/payload/foo.bar")
      .expect(403);
    });

    it("obtains a valid login link (text/plain)", async function(){
      const maxAge = this.server.locals.sessionMaxAge;
      let res = await request(this.server).get(`/auth/login/${user.username}/link`)
      .set("Authorization", await bearer(admin.username))
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

    it("requires admin rights", async function(){
      await request(this.server).get(`/auth/login/${user.username}/link`)
      .expect(401);

      await request(this.server).get(`/auth/login/${user.username}/link`)
      .set("Authorization", await bearer(user.username))
      .expect(401);
    });

    it("accepts custom redirect URL", async function(){
      let res = await request(this.server).get(`/auth/login/${user.username}/link`)
      .set("Authorization", await bearer(admin.username))
      .set("Accept", "text/plain")
      .expect(200)
      .expect("Content-Type", "text/plain; charset=utf-8");

      expect(res.text).to.match(/^http:/);
      let url = new URL(res.text);

    })
  });
});


describe("formatLoginPayload() / parseLoginPayload()", function(){
  it("can parse a formatted login payload", function(){
    const key = "some random string";
    const params = {
      uid: 128,
      username: "foo",
      expires: Date.now(),
    };
    const payload = formatLoginPayload(key, params);
    expect(parseLoginPayload([key], payload)).to.deep.equal(params);
  });

  it("can use any key from a list to parse parameters", function(){
    const keys = ["some random string", "some other string", "another string"];
    const params = {
      uid: 128,
      username: "foo",
      expires: Date.now(),
    };
    keys.forEach((key, index)=>{
      const payload = formatLoginPayload(key, params);
      expect(parseLoginPayload(keys, payload), `using key #${index}`).to.deep.equal(params);
    });
  });

  it("throws if signature doesn't match", function(){
    const params = {
      uid: 128,
      username: "foo",
      expires: Date.now(),
    };
    const payload = formatLoginPayload("some key", params);
    expect(()=>parseLoginPayload(["another key"], payload)).to.throw(ForbiddenError);

    const tamperedPayload = payload.split(".")[0]+"."+Buffer.from(JSON.stringify({...params, uid: 129})).toString("base64url")
    expect(()=>parseLoginPayload(["some key"], tamperedPayload)).to.throw(ForbiddenError);
  });

  it("throws if payload is malformed", function(){
    expect(()=>parseLoginPayload(["some key"], "some-invalid-string")).to.throw(BadRequestError);
  })
});

describe("makeRedirect()", function(){
  it("crafts an authenticated redirect payload", function(){
    const url = makeRedirect("some key", {user:{uid: 128, username: "alice"}, expiresIn: 5000, redirect: new URL("http://example.com/foo/")});
    const payload = url.pathname.split("/").pop()!;
    expect(payload).to.be.ok;
    const [sig, data] = payload.split(".");
    expect(sig).to.be.ok;
    expect(data).to.be.ok;
    const params = JSON.parse(Buffer.from(data, "base64url").toString("utf-8"));
    expect(params).to.have.property("uid", 128);
    expect(params).to.have.property("username", "alice");
    expect(params).to.have.property("expires").a("number").above(Date.now());
    expect(params).to.have.property("redirect").a("string");
  });
})
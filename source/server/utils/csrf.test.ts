
import request from "supertest";

import User from "../auth/User.js";
import UserManager from "../auth/UserManager.js";


describe("CSRF protection (origin checks)", function(){
  let userManager :UserManager, user :User;

  this.beforeAll(async function(){
    let locals = await createIntegrationContext(this);
    userManager = locals.userManager;
  });

  this.beforeEach(async function(){
    await resetIntegrationContext(this);
    user = await userManager.addUser("bob", "12345678");
  });

  async function login(server: any){
    const agent = request.agent(server);
    await agent.post("/auth/login")
      .send({username: user.username, password: "12345678"})
      .set("Content-Type", "application/json")
      .set("Accept", "")
      .expect(200);
    return agent;
  }

  describe("session-authenticated unsafe requests", function(){
    it("rejects a cross-origin POST (forged Origin)", async function(){
      const agent = await login(this.server);
      const res = await agent.post("/auth/tokens")
        .set("Origin", "https://evil.example.com")
        .send({name: "csrf"})
        .expect(403);
      expect(res.body).to.have.property("message").match(/Cross-origin/);
    });

    it("rejects Sec-Fetch-Site: cross-site", async function(){
      const agent = await login(this.server);
      await agent.post("/auth/tokens")
        .set("Sec-Fetch-Site", "cross-site")
        .send({name: "csrf"})
        .expect(403);
    });

    it("accepts a matching Origin", async function(){
      const agent = await login(this.server);
      //getHost() builds the origin from the Host header
      await agent.post("/auth/tokens")
        .set("Host", "ecorpus.example.com")
        .set("Origin", "http://ecorpus.example.com")
        .send({name: "same-origin"})
        .expect(201);
    });

    it("accepts Sec-Fetch-Site: same-origin", async function(){
      const agent = await login(this.server);
      await agent.post("/auth/tokens")
        .set("Sec-Fetch-Site", "same-origin")
        .send({name: "same-origin"})
        .expect(201);
    });

    it("accepts Sec-Fetch-Site: same-origin even when Origin is null", async function(){
      //A strict Referrer-Policy makes browsers send `Origin: null` on form
      //navigations (e.g. the user-creation or logout forms). Fetch Metadata is
      //trustworthy and says same-origin, so the mismatched Origin must be ignored.
      const agent = await login(this.server);
      await agent.post("/auth/tokens")
        .set("Sec-Fetch-Site", "same-origin")
        .set("Origin", "null")
        .send({name: "null-origin"})
        .expect(201);
    });

    it("rejects Sec-Fetch-Site: same-site (sibling subdomain)", async function(){
      const agent = await login(this.server);
      await agent.post("/auth/tokens")
        .set("Sec-Fetch-Site", "same-site")
        .send({name: "same-site"})
        .expect(403);
    });

    it("accepts requests without Origin (non-browser clients)", async function(){
      const agent = await login(this.server);
      await agent.post("/auth/tokens")
        .send({name: "no-origin"})
        .expect(201);
    });
  });

  describe("exemptions", function(){
    it("Bearer requests are exempt, even with a foreign Origin", async function(){
      //The Authorization header doesn't travel cross-site: nothing to forge.
      //This is what keeps non-browser clients (incl. WebDAV over tokens) working.
      const session = await login(this.server);
      const created = await session.post("/auth/tokens").send({name: "service"}).expect(201);
      const res = await request(this.server).get("/auth/tokens")
        .set("Authorization", `Bearer ${created.body.token}`)
        .set("Origin", "https://anywhere.example.com")
        .expect(200);
      expect(res.body).to.have.length(1);
      //Unsafe method too
      await request(this.server).delete(`/auth/tokens/${res.body[0].id}`)
        .set("Authorization", `Bearer ${created.body.token}`)
        .set("Origin", "https://anywhere.example.com")
        .expect(204);
    });

    it("anonymous requests are exempt", async function(){
      //Nothing to forge without a credential: the request fails authentication, not CSRF
      await request(this.server).post("/auth/tokens")
        .set("Origin", "https://evil.example.com")
        .send({name: "anonymous"})
        .expect(401);
    });

    it("safe methods are exempt", async function(){
      const agent = await login(this.server);
      await agent.get("/auth/tokens")
        .set("Origin", "https://evil.example.com")
        .expect(200);
    });
  });

  describe("security headers", function(){
    it("emits a Content-Security-Policy-Report-Only header", async function(){
      const res = await request(this.server).get("/auth/login").expect(200);
      expect(res.headers).to.have.property("content-security-policy-report-only").match(/default-src 'self'/);
    });

    it("allows the Google Fonts stylesheet and woff2 files in the CSP", async function(){
      const res = await request(this.server).get("/auth/login").expect(200);
      const csp = res.headers["content-security-policy-report-only"];
      expect(csp, csp).to.match(/style-src[^;]*https:\/\/fonts\.googleapis\.com/);
      expect(csp, csp).to.match(/font-src[^;]*https:\/\/fonts\.gstatic\.com/);
    });

    it("emits X-Content-Type-Options", async function(){
      const res = await request(this.server).get("/auth/login").expect(200);
      expect(res.headers).to.have.property("x-content-type-options", "nosniff");
    });

    it("denies framing of auth pages (OAuth consent clickjacking)", async function(){
      const res = await request(this.server).get("/auth/login").expect(200);
      expect(res.headers).to.have.property("x-frame-options", "DENY");
      expect(res.headers).to.have.property("content-security-policy", "frame-ancestors 'none'");
    });

    it("keeps other pages frameable (scene embedding)", async function(){
      const res = await request(this.server).get("/").expect(302);
      expect(res.headers).not.to.have.property("x-frame-options");
      expect(res.headers).not.to.have.property("content-security-policy");
    });
  });
});

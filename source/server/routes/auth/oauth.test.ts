
import { createHash, randomBytes } from "crypto";
import request from "supertest";

import User from "../../auth/User.js";
import UserManager from "../../auth/UserManager.js";


describe("OAuth2 authorization server", function(){
  let userManager :UserManager, user :User, admin :User;
  const redirectUri = "https://service.example.com/callback";

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

  function makePkce(){
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    return {verifier, challenge};
  }

  async function makeClient(){
    return await userManager.createClient("packager", [redirectUri]);
  }

  function authorizeQuery(clientId: number, challenge: string, params: Record<string, string> = {}){
    return new URLSearchParams({
      response_type: "code",
      client_id: String(clientId),
      redirect_uri: redirectUri,
      state: "some-state",
      scope: "all",
      code_challenge: challenge,
      code_challenge_method: "S256",
      ...params,
    });
  }

  /** Run the authorize → consent steps, returns the authorization code */
  async function getCode(server: any, agent: request.Agent, clientId: number, challenge: string, params: Record<string, string> = {}){
    const q = authorizeQuery(clientId, challenge, params);
    await agent.get(`/auth/oauth/authorize?${q}`).expect(200);
    const consent = await agent.post("/auth/oauth/authorize")
      .type("form")
      .send({...Object.fromEntries(q), action: "allow"})
      .expect(302);
    const location = new URL(consent.headers["location"]);
    expect(location.toString()).to.match(new RegExp(`^${redirectUri}`));
    expect(location.searchParams.get("state")).to.equal(params["state"] ?? "some-state");
    const code = location.searchParams.get("code");
    expect(code, "expected an authorization code").to.be.ok;
    return code as string;
  }

  describe("happy path", function(){
    it("authorization code flow with PKCE, end to end", async function(){
      const {client, secret} = await makeClient();
      const {verifier, challenge} = makePkce();
      const agent = await login(this.server, user);

      //Consent page names the client and the scope
      const page = await agent.get(`/auth/oauth/authorize?${authorizeQuery(client.id, challenge)}`)
        .expect(200);
      expect(page.text).to.contain("packager");

      const code = await getCode(this.server, agent, client.id, challenge);

      //Exchange the code (client_secret_post)
      const tokenRes = await request(this.server).post("/auth/oauth/token")
        .type("form")
        .send({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: String(client.id),
          client_secret: secret,
          code_verifier: verifier,
        })
        .expect(200);
      expect(tokenRes.body).to.have.property("access_token").match(/^ecorpus_/);
      expect(tokenRes.body).to.have.property("token_type", "Bearer");
      expect(tokenRes.body).to.have.property("scope", "all");

      //The token answers the "does this user exist, at what level" question
      await request(this.server).get("/auth/")
        .set("Authorization", `Bearer ${tokenRes.body.access_token}`)
        .set("Accept", "application/json")
        .expect(200)
        .expect({uid: user.uid, username: user.username, level: user.level});

      //The grant is inspectable by its owner, labeled with the client name
      const list = await agent.get("/auth/tokens").expect(200);
      expect(list.body).to.have.length(1);
      expect(list.body[0]).to.have.property("client", "packager");

      //RFC7009 revocation: possession of the token is sufficient
      await request(this.server).post("/auth/oauth/revoke")
        .type("form")
        .send({token: tokenRes.body.access_token})
        .expect(200);
      await request(this.server).get("/auth/")
        .set("Authorization", `Bearer ${tokenRes.body.access_token}`)
        .expect(401);
    });

    it("issues restricted tokens (scenes:read)", async function(){
      const {client, secret} = await makeClient();
      const {verifier, challenge} = makePkce();
      const agent = await login(this.server, user);
      const code = await getCode(this.server, agent, client.id, challenge, {scope: "scenes:read"});
      const tokenRes = await request(this.server).post("/auth/oauth/token")
        .type("form")
        .send({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: String(client.id),
          client_secret: secret,
          code_verifier: verifier,
        })
        .expect(200);
      expect(tokenRes.body).to.have.property("scope", "scenes:read");
    });

    it("supports client_secret_basic at the token endpoint", async function(){
      const {client, secret} = await makeClient();
      const {verifier, challenge} = makePkce();
      const agent = await login(this.server, user);
      const code = await getCode(this.server, agent, client.id, challenge);

      const res = await request(this.server).post("/auth/oauth/token")
        .set("Authorization", `Basic ${Buffer.from(`${client.id}:${secret}`).toString("base64")}`)
        .type("form")
        .send({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          code_verifier: verifier,
        })
        .expect(200);
      expect(res.body).to.have.property("access_token");
    });

    it("publishes RFC8414 server metadata", async function(){
      const res = await request(this.server).get("/.well-known/oauth-authorization-server")
        .expect(200);
      expect(res.body).to.have.property("authorization_endpoint").match(/\/auth\/oauth\/authorize$/);
      expect(res.body).to.have.property("token_endpoint").match(/\/auth\/oauth\/token$/);
      expect(res.body).to.have.property("code_challenge_methods_supported").deep.equal(["S256"]);
      expect(res.body).to.have.property("scopes_supported").deep.equal([
        "all",
        "scenes:read", "scenes:write", "scenes:admin", "scenes:create",
        "tasks:read", "tasks:write",
      ]);
    });
  });

  describe("GET /auth/oauth/authorize", function(){
    it("bounces anonymous users through the login page", async function(){
      const {client} = await makeClient();
      const {challenge} = makePkce();
      const res = await request(this.server)
        .get(`/auth/oauth/authorize?${authorizeQuery(client.id, challenge)}`)
        .expect(302);
      expect(res.headers["location"]).to.match(/^\/auth\/login\?redirect=/);
      //The redirect goes back to the authorize endpoint with all its parameters
      const redirect = decodeURIComponent(res.headers["location"].split("redirect=")[1]);
      expect(redirect).to.contain("/auth/oauth/authorize");
      expect(redirect).to.contain("code_challenge");
    });

    it("rejects unknown clients on our own page (no redirect)", async function(){
      const {challenge} = makePkce();
      const agent = await login(this.server, user);
      await agent.get(`/auth/oauth/authorize?${authorizeQuery(404404, challenge)}`)
        .expect(400);
    });

    it("rejects unregistered redirect URIs on our own page (no redirect)", async function(){
      const {client} = await makeClient();
      const {challenge} = makePkce();
      const agent = await login(this.server, user);
      const q = authorizeQuery(client.id, challenge, {redirect_uri: "https://evil.example.com/"});
      await agent.get(`/auth/oauth/authorize?${q}`).expect(400);
    });

    it("reports other errors through the redirect URI", async function(){
      const {client} = await makeClient();
      const {challenge} = makePkce();
      const agent = await login(this.server, user);

      for(const [params, error] of [
        [{response_type: "token"}, "unsupported_response_type"],
        [{code_challenge: ""}, "invalid_request"],
        [{code_challenge_method: "plain"}, "invalid_request"],
        [{scope: "banana"}, "invalid_scope"],
      ] as [Record<string, string>, string][]){
        const res = await agent.get(`/auth/oauth/authorize?${authorizeQuery(client.id, challenge, params)}`)
          .expect(302);
        const location = new URL(res.headers["location"]);
        expect(location.origin + location.pathname).to.equal(redirectUri);
        expect(location.searchParams.get("error")).to.equal(error);
        expect(location.searchParams.get("state")).to.equal("some-state");
      }
    });

    it("an omitted scope defaults to 'all'", async function(){
      const {client} = await makeClient();
      const {challenge} = makePkce();
      const agent = await login(this.server, user);
      const q = authorizeQuery(client.id, challenge);
      q.delete("scope");
      const res = await agent.get(`/auth/oauth/authorize?${q}`)
        .expect(200);
      expect(res.text).to.match(/name="scope" value="all"/);
    });

    it("user-level names are not scopes", async function(){
      const {client} = await makeClient();
      const {challenge} = makePkce();
      const agent = await login(this.server, user);
      const res = await agent.get(`/auth/oauth/authorize?${authorizeQuery(client.id, challenge, {scope: "admin"})}`)
        .expect(302);
      const location = new URL(res.headers["location"]);
      expect(location.searchParams.get("error")).to.equal("invalid_scope");
    });
  });

  describe("persisted consent (silent renewal)", function(){
    /** Expect a 302 carrying an authorization code, return the code */
    function expectCode(res: request.Response): string{
      const location = new URL(res.headers["location"]);
      expect(location.origin + location.pathname).to.equal(redirectUri);
      expect(location.searchParams.get("error"), `expected a code, got error=${location.searchParams.get("error")}`).to.be.null;
      const code = location.searchParams.get("code");
      expect(code, "expected an authorization code").to.be.ok;
      return code as string;
    }

    it("re-issues codes without a consent page once consent was given", async function(){
      const {client, secret} = await makeClient();
      const agent = await login(this.server, user);
      //First authorization: interactive consent
      const first = makePkce();
      await getCode(this.server, agent, client.id, first.challenge);

      //Renewal: same client, fresh PKCE — no consent page, straight to a code
      const second = makePkce();
      const res = await agent.get(`/auth/oauth/authorize?${authorizeQuery(client.id, second.challenge)}`)
        .expect(302);
      const code = expectCode(res);

      //The silently-issued code exchanges into a working token
      const tokenRes = await request(this.server).post("/auth/oauth/token")
        .type("form")
        .send({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: String(client.id),
          client_secret: secret,
          code_verifier: second.verifier,
        })
        .expect(200);
      await request(this.server).get("/auth/")
        .set("Authorization", `Bearer ${tokenRes.body.access_token}`)
        .set("Accept", "application/json")
        .expect(200);
    });

    it("covers narrower scopes, re-prompts for broader ones", async function(){
      const {client} = await makeClient();
      const agent = await login(this.server, user);
      //Consent to scenes:read only
      const first = makePkce();
      await getCode(this.server, agent, client.id, first.challenge, {scope: "scenes:read"});

      //scenes:read again: silent
      const second = makePkce();
      expectCode(await agent.get(`/auth/oauth/authorize?${authorizeQuery(client.id, second.challenge, {scope: "scenes:read"})}`)
        .expect(302));

      //all is broader: consent page again
      await agent.get(`/auth/oauth/authorize?${authorizeQuery(client.id, makePkce().challenge, {scope: "all"})}`)
        .expect(200);
    });

    it("consent is per-client", async function(){
      const {client} = await makeClient();
      const {client: other} = await userManager.createClient("other-app", [redirectUri]);
      const agent = await login(this.server, user);
      await getCode(this.server, agent, client.id, makePkce().challenge);
      //No consent stored for the other client: consent page
      await agent.get(`/auth/oauth/authorize?${authorizeQuery(other.id, makePkce().challenge)}`)
        .expect(200);
    });

    it("prompt=none reports login_required to anonymous users", async function(){
      const {client} = await makeClient();
      const res = await request(this.server)
        .get(`/auth/oauth/authorize?${authorizeQuery(client.id, makePkce().challenge, {prompt: "none"})}`)
        .expect(302);
      const location = new URL(res.headers["location"]);
      expect(location.origin + location.pathname).to.equal(redirectUri);
      expect(location.searchParams.get("error")).to.equal("login_required");
      expect(location.searchParams.get("state")).to.equal("some-state");
    });

    it("prompt=none reports consent_required when no grant covers the scope", async function(){
      const {client} = await makeClient();
      const agent = await login(this.server, user);
      const res = await agent.get(`/auth/oauth/authorize?${authorizeQuery(client.id, makePkce().challenge, {prompt: "none"})}`)
        .expect(302);
      const location = new URL(res.headers["location"]);
      expect(location.searchParams.get("error")).to.equal("consent_required");
    });

    it("prompt=none issues a code when a grant covers the scope", async function(){
      const {client} = await makeClient();
      const agent = await login(this.server, user);
      await getCode(this.server, agent, client.id, makePkce().challenge);
      expectCode(await agent.get(`/auth/oauth/authorize?${authorizeQuery(client.id, makePkce().challenge, {prompt: "none"})}`)
        .expect(302));
    });

    it("prompt=consent always shows the consent page", async function(){
      const {client} = await makeClient();
      const agent = await login(this.server, user);
      await getCode(this.server, agent, client.id, makePkce().challenge);
      await agent.get(`/auth/oauth/authorize?${authorizeQuery(client.id, makePkce().challenge, {prompt: "consent"})}`)
        .expect(200);
    });

    it("lists authorized applications", async function(){
      const {client} = await makeClient();
      const agent = await login(this.server, user);
      const empty = await agent.get("/auth/oauth/grants").expect(200);
      expect(empty.body).to.have.length(0);

      await getCode(this.server, agent, client.id, makePkce().challenge, {scope: "scenes:read"});
      const list = await agent.get("/auth/oauth/grants").expect(200);
      expect(list.body).to.have.length(1);
      expect(list.body[0]).to.have.property("client_name", "packager");
      expect(list.body[0]).to.have.property("scope").deep.equal(["scenes:read"]);
    });

    it("revoking a grant stops silent renewal and kills the client's tokens", async function(){
      const {client, secret} = await makeClient();
      const agent = await login(this.server, user);
      const {verifier, challenge} = makePkce();
      const code = await getCode(this.server, agent, client.id, challenge);
      const tokenRes = await request(this.server).post("/auth/oauth/token")
        .type("form")
        .send({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: String(client.id),
          client_secret: secret,
          code_verifier: verifier,
        })
        .expect(200);

      await agent.delete(`/auth/oauth/grants/${client.id}`).expect(204);

      //The token the client held is revoked along with the consent
      await request(this.server).get("/auth/")
        .set("Authorization", `Bearer ${tokenRes.body.access_token}`)
        .expect(401);
      //Renewal is interactive again
      await agent.get(`/auth/oauth/authorize?${authorizeQuery(client.id, makePkce().challenge)}`)
        .expect(200);
      //But personal tokens (not minted through this client) survive
      const personal = await agent.post("/auth/tokens").send({name: "mine"}).expect(201);
      await agent.delete(`/auth/oauth/grants/${client.id}`).expect(204);
      await request(this.server).get("/auth/")
        .set("Authorization", `Bearer ${personal.body.token}`)
        .expect(200);
    });

    it("grants management requires the owner's full authority", async function(){
      const {client} = await makeClient();
      const agent = await login(this.server, user);
      await getCode(this.server, agent, client.id, makePkce().challenge, {scope: "scenes:read"});
      const restricted = await agent.post("/auth/tokens").send({name: "restricted", scope: ["scenes:read"]}).expect(201);
      await request(this.server).get("/auth/oauth/grants")
        .set("Authorization", `Bearer ${restricted.body.token}`)
        .expect(401);
      await request(this.server).delete(`/auth/oauth/grants/${client.id}`)
        .set("Authorization", `Bearer ${restricted.body.token}`)
        .expect(401);
    });
  });

  describe("POST /auth/oauth/authorize", function(){
    it("requires a session: API tokens can not consent", async function(){
      const {client} = await makeClient();
      const {challenge} = makePkce();
      const q = Object.fromEntries(authorizeQuery(client.id, challenge));
      await request(this.server).post("/auth/oauth/authorize")
        .set("Authorization", await bearer(user.username))
        .type("form")
        .send({...q, action: "allow"})
        .expect(401);
    });

    it("deny sends access_denied through the redirect URI", async function(){
      const {client} = await makeClient();
      const {challenge} = makePkce();
      const agent = await login(this.server, user);
      const q = Object.fromEntries(authorizeQuery(client.id, challenge));
      const res = await agent.post("/auth/oauth/authorize")
        .type("form")
        .send({...q, action: "deny"})
        .expect(302);
      const location = new URL(res.headers["location"]);
      expect(location.searchParams.get("error")).to.equal("access_denied");
      expect(location.searchParams.get("code")).to.be.null;
    });
  });

  describe("POST /auth/oauth/token", function(){
    let client: Awaited<ReturnType<UserManager["createClient"]>>["client"];
    let secret: string;
    let code: string, verifier: string;

    this.beforeEach(async function(){
      const created = await makeClient();
      client = created.client;
      secret = created.secret!;
      const pkce = makePkce();
      verifier = pkce.verifier;
      const agent = await login(this.server, user);
      code = await getCode(this.server, agent, client.id, pkce.challenge);
    });

    function exchange(server: any, params: Record<string, string|undefined> = {}){
      const body: Record<string, string> = {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: String(client.id),
        client_secret: secret,
        code_verifier: verifier,
      };
      for(const [k, v] of Object.entries(params)){
        if(typeof v === "undefined") delete body[k];
        else body[k] = v;
      }
      return request(server).post("/auth/oauth/token").type("form").send(body);
    }

    it("rejects other grant types", async function(){
      const res = await exchange(this.server, {grant_type: "client_credentials"}).expect(400);
      expect(res.body).to.have.property("error", "unsupported_grant_type");
    });

    it("rejects bad client credentials", async function(){
      let res = await exchange(this.server, {client_secret: randomBytes(32).toString("base64url")}).expect(401);
      expect(res.body).to.have.property("error", "invalid_client");
      res = await exchange(this.server, {client_secret: undefined}).expect(401);
      expect(res.body).to.have.property("error", "invalid_client");
    });

    it("rejects a PKCE verifier mismatch", async function(){
      const res = await exchange(this.server, {code_verifier: randomBytes(32).toString("base64url")}).expect(400);
      expect(res.body).to.have.property("error", "invalid_grant");
    });

    it("rejects a redirect_uri mismatch", async function(){
      const res = await exchange(this.server, {redirect_uri: "https://service.example.com/other"}).expect(400);
      expect(res.body).to.have.property("error", "invalid_grant");
    });

    it("authorization codes are single-use", async function(){
      await exchange(this.server).expect(200);
      const res = await exchange(this.server).expect(400);
      expect(res.body).to.have.property("error", "invalid_grant");
    });

    it("codes are bound to their client", async function(){
      const other = await userManager.createClient("other", [redirectUri]);
      const res = await exchange(this.server, {
        client_id: String(other.client.id),
        client_secret: other.secret!,
      }).expect(400);
      expect(res.body).to.have.property("error", "invalid_grant");
    });
  });

  describe("client management", function(){
    it("admins can register and list clients", async function(){
      const agent = await login(this.server, admin);
      const res = await agent.post("/auth/oauth/clients")
        .send({name: "packager", redirect_uris: [redirectUri]})
        .expect(201);
      expect(res.body).to.have.property("id").a("number");
      expect(res.body).to.have.property("client_secret").a("string");

      const list = await agent.get("/auth/oauth/clients").expect(200);
      expect(list.body).to.have.length(1);
      expect(list.body[0]).not.to.have.property("client_secret");
    });

    it("regular users can not", async function(){
      const agent = await login(this.server, user);
      await agent.get("/auth/oauth/clients").expect(401);
      await agent.post("/auth/oauth/clients")
        .send({name: "packager", redirect_uris: [redirectUri]})
        .expect(401);
    });

    it("validates redirect URIs", async function(){
      const agent = await login(this.server, admin);
      await agent.post("/auth/oauth/clients")
        .send({name: "packager", redirect_uris: ["not-a-url"]})
        .expect(400);
      await agent.post("/auth/oauth/clients")
        .send({name: "packager", redirect_uris: []})
        .expect(400);
    });

    it("deleting a client revokes every token it minted", async function(){
      const {client, secret} = await makeClient();
      const {verifier, challenge} = makePkce();
      const agent = await login(this.server, user);
      const code = await getCode(this.server, agent, client.id, challenge);
      const tokenRes = await request(this.server).post("/auth/oauth/token")
        .type("form")
        .send({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: String(client.id),
          client_secret: secret,
          code_verifier: verifier,
        })
        .expect(200);

      const adminAgent = await login(this.server, admin);
      await adminAgent.delete(`/auth/oauth/clients/${client.id}`).expect(204);
      await request(this.server).get("/auth/")
        .set("Authorization", `Bearer ${tokenRes.body.access_token}`)
        .expect(401);
    });
  });
});

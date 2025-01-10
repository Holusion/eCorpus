
import request from "supertest";
import User from "../../../auth/User.js";
import UserManager from "../../../auth/UserManager.js";
import Vfs from "../../../vfs/index.js";



describe("GET /tags/:tag", function(){
  let vfs :Vfs, userManager :UserManager;
  let user :User;
  let admin :User;

  this.beforeEach(async function(){
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager = locals.userManager;
    admin = await userManager.addUser("alice", "12345678", true);
    user = await userManager.addUser("bob", "12345678");
    this.server.set("trust proxy", true);
  });

  this.afterEach(async function(){
    await cleanIntegrationContext(this);
  });

  it("requires authentication", async function(){
    let s1 = await vfs.createScene("foo");
    await vfs.addTag("foo", "footag");
    await request(this.server).get("/tags/footag")
    .expect(401);
  });

  describe("as user", function(){
    this.beforeEach(async function(){
      this.agent = request.agent(this.server);
      await this.agent.post("/auth/login")
      .send({username: user.username, password: "12345678"})
      .set("Content-Type", "application/json")
      .set("Accept", "")
      .expect(200);
    });
    it("get a list of tagged scenes", async function(){
      let s1 = await vfs.createScene("foo", user.uid);
      await vfs.addTag("foo", "footag");
      let {body} = await this.agent.get("/tags/footag")
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");
      let ref = await vfs.getScene(s1, user.uid);
      expect(body).to.deep.equal([{...ref, ctime: ref.ctime.toISOString(), mtime: ref.mtime.toISOString()}]);
    });

    it("don't show private scenes", async function(){
      let s1 = await vfs.createScene("public",  {"0": "none", "1": "read"});
      await vfs.addTag("public", "footag");
      let s2 = await vfs.createScene("personal", user.uid);
      await vfs.addTag("personal", "footag");
      let s3 = await vfs.createScene("private", {[admin.uid]: "admin", "0": "none", "1": "none"});
      await vfs.addTag("private", "footag");
      
      let {body} = await this.agent.get("/tags/footag")
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");
      expect(body).to.have.property("length", 2);
    });

    it("gets absolute URLs for thumbnails", async function(){
      let s1 = await vfs.createScene("foo");
      await vfs.writeDoc("some data\n", {scene: s1, name: "scene-image-thumb.jpg", user_id: 0, mime: "image/png"});
      await vfs.addTag("foo", "footag");

      let {body} = await this.agent.get("/tags/footag")
      .set("X-Forwarded-Host", "example.com")
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");
      expect(body).to.have.property("length", 1);
      expect(body[0]).to.have.property("thumb", "http://example.com/scenes/foo/scene-image-thumb.jpg");
    });
  });

  describe("as administrator", function(){
    this.beforeEach(async function(){
      this.agent = request.agent(this.server);
      await this.agent.post("/auth/login")
      .send({username: admin.username, password: "12345678"})
      .set("Content-Type", "application/json")
      .set("Accept", "")
      .expect(200);
    });

    it("get a list of tagged scenes", async function(){
      let s1 = await vfs.createScene("a", admin.uid);
      await vfs.addTag("a", "footag");

      let s2 = await vfs.createScene("b", user.uid);
      await vfs.addTag("b", "footag");

      let {body} = await this.agent.get("/tags/footag")
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");

      let ref1 = await vfs.getScene(s1, admin.uid);
      let ref2 = await vfs.getScene(s2, admin.uid);
      expect(body).to.deep.equal([
        {...ref1, ctime: ref1.ctime.toISOString(), mtime: ref1.mtime.toISOString()},
        {...ref2, ctime: ref2.ctime.toISOString(), mtime: ref2.mtime.toISOString()},
      ]);
    });
  });
});

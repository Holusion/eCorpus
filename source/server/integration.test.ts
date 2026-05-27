import fs from "fs/promises";
import path from "path";

import request from "supertest";
import Vfs from "./vfs/index.js";
import User, { UserLevels } from "./auth/User.js";
import UserManager from "./auth/UserManager.js";

import { fixturesDir } from "./__test_fixtures/fixtures.js";



describe("Web Server Integration", function(){
  let vfs :Vfs, userManager :UserManager, user :User, admin :User;
  this.beforeAll(async function(){
    let locals
    try{
      locals = await createIntegrationContext(this);
    }catch(e){
      console.error(e);
      throw e;
    }
    vfs = locals.vfs;
    userManager = locals.userManager;
  });
  this.beforeEach(async function(){
    await resetIntegrationContext(this);
    user = await userManager.addUser("bob", "12345678");
    admin = await userManager.addUser("alice", "12345678", "admin");
  });

  describe("robots.txt", function(){
    it("is served at /robots.txt as text/plain", async function(){
      const res = await request(this.server).get("/robots.txt").expect(200);
      expect(res.headers["content-type"]).to.match(/^text\/plain/);
      expect(res.text).to.match(/^User-agent: \*/);
      expect(res.text).to.include("Disallow: /admin/");
      expect(res.text).to.include("Disallow: /auth/");
    });
    it("advertises the sitemap", async function(){
      const res = await request(this.server).get("/robots.txt").expect(200);
      expect(res.text).to.match(/Sitemap:\s+https?:\/\/[^\s]+\/sitemap\.xml/);
    });
  });

  describe("sitemap.xml", function(){
    this.beforeEach(async function(){
      const pub = await vfs.createScene("public-scene", user.uid);
      await vfs.writeDoc("{}", {scene:pub, user_id:user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
      await vfs.writeDoc("{}", {scene:pub, user_id:user.uid, name: "scene-image-thumb.jpg", mime: "image/jpeg"});
      await userManager.setPublicAccess("public-scene", "read");

      const noThumb = await vfs.createScene("public-no-thumb", user.uid);
      await vfs.writeDoc("{}", {scene:noThumb, user_id:user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
      await userManager.setPublicAccess("public-no-thumb", "read");

      await vfs.createScene("private-scene", user.uid);
      await userManager.setPublicAccess("private-scene", "none");
    });
    it("is served at /sitemap.xml as application/xml", async function(){
      const res = await request(this.server).get("/sitemap.xml").expect(200);
      expect(res.headers["content-type"]).to.match(/^application\/xml/);
      expect(res.text).to.match(/^<\?xml/);
      expect(res.text).to.include("<urlset");
      expect(res.text).to.include("</urlset>");
    });
    it("lists public scenes only", async function(){
      const res = await request(this.server).get("/sitemap.xml").expect(200);
      expect(res.text).to.include("/ui/scenes/public-scene");
      expect(res.text).to.not.include("/ui/scenes/private-scene");
    });
    it("includes hreflang alternates for every supported locale", async function(){
      const res = await request(this.server).get("/sitemap.xml").expect(200);
      expect(res.text).to.match(/hreflang="en"/);
      expect(res.text).to.match(/hreflang="fr"/);
      expect(res.text).to.match(/hreflang="x-default"/);
    });
    it("declares the image-sitemap namespace and emits <image:image> for scenes with a thumbnail", async function(){
      const res = await request(this.server).get("/sitemap.xml").expect(200);
      expect(res.text).to.include('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
      expect(res.text).to.include("<image:image><image:loc>");
      expect(res.text).to.match(/\/scenes\/public-scene\/scene-image-thumb\.jpg/);
    });
    it("omits <image:image> for scenes without a thumbnail", async function(){
      const res = await request(this.server).get("/sitemap.xml").expect(200);
      // public-no-thumb appears, but no image entry sits inside its <url>
      const noThumbBlock = res.text.match(/<url>\s*<loc>[^<]*public-no-thumb[^<]*<\/loc>[\s\S]*?<\/url>/);
      expect(noThumbBlock, "public-no-thumb <url> block").to.exist;
      expect(noThumbBlock![0]).to.not.include("<image:image>");
    });
    it("honours an explicit ?lang= query", async function(){
      const res = await request(this.server).get("/sitemap.xml?lang=fr").expect(200);
      expect(res.headers["content-language"]).to.equal("fr");
    });
    it("falls back to Accept-Language", async function(){
      const res = await request(this.server)
        .get("/sitemap.xml")
        .set("Accept-Language", "fr;q=0.9, en;q=0.5")
        .expect(200);
      expect(res.headers["content-language"]).to.equal("fr");
    });
    it("ignores an unsupported ?lang= value", async function(){
      const res = await request(this.server)
        .get("/sitemap.xml?lang=xx")
        .set("Accept-Language", "fr")
        .expect(200);
      expect(res.headers["content-language"]).to.equal("fr");
    });
  });

  describe("permissions", function(){
    let scene_id :number;
    this.beforeEach(async function(){
      scene_id = await vfs.createScene("foo", user.uid);
      await vfs.writeDoc("{}", {scene:scene_id, user_id:user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
      await vfs.writeFile(dataStream(), {scene: "foo", mime:"model/gltf-binary", name: "models/foo.glb", user_id: user.uid});
    });
    describe("(anonymous)", function(){
      
      it("can GET files in scenes/", async function(){
        await request(this.server).get("/scenes/foo/models/foo.glb").expect(200);
      });
      it("can't create a model", async function(){
        await request(this.server).put("/scenes/foo/models/bar.glb").expect(401);
      });
      it("can't fetch user list", async function(){
        await request(this.server).get("/users")
        .expect(401);
      });
    });

    describe("(author)", function(){
      this.beforeEach(async function(){
        this.agent = request.agent(this.server);
        await this.agent.post("/auth/login")
        .send({username: user.username, password: "12345678"})
        .set("Content-Type", "application/json")
        .set("Accept", "")
        .expect(200);
      });

      it("can create a new scene", async function(){
        let content = await fs.readFile(path.join(fixturesDir, "cube.glb"));
        let r = await this.agent.post("/scenes/bar")
        .set("Content-Type", "application/octet-stream")
        .send(content)
        expect(r.status, `Expected status code 201 but received [${r.status}]: ${r.text}`).to.equal(201);
        let res = await this.agent.get("/scenes/bar/bar.glb").expect(200);
        expect(res.text.slice(0,4).toString()).to.equal("glTF");
        expect(res.text.length).to.equal(content.length);

        let {body:doc} = await this.agent.get("/scenes/bar/scene.svx.json").expect(200);
        expect(doc).to.have.property("models").an("array").to.have.length(1);
      });

      it("can upload a glb model in an existing scene", async function(){
        let content = await fs.readFile(path.join(fixturesDir, "cube.glb"));
        await this.agent.put("/scenes/foo/models/baz.glb")
        .send(content)
        .expect(201);
      });

      it("can upload a usdz model in an existing scene", async function(){
        await this.agent.put("/scenes/foo/models/baz.usdz")
        .send("xxx\n")
        .expect(201);
      });

      it("can edit a model", async function(){
        await this.agent.put("/scenes/foo/models/foo.glb").send("foo\n").expect(200);
        let {body} = await this.agent.get("/scenes/foo/models/foo.glb")
        .responseType("blob")
        .expect("Content-Type", "model/gltf-binary")
        .expect(200);
        expect(body.toString()).to.equal("foo\n");
      });

      it("can PUT an article", async function(){
        await this.agent.put("/scenes/foo/articles/something-something.html")
        .set("Content-Type", "text/html")
        .send("foo")
        .expect(201);
      });

      it("can PUT a modified document", async function(){
        let c = `{"foo":"bar"}`
        await this.agent.put("/scenes/foo/foo.svx.json")
        .set("Content-Type", "application/si-dpo-3d.document+json")
        .send(c)
        .expect(204);
        
        let {text} = await this.agent.get("/scenes/foo/foo.svx.json")
        .expect(200)
        .expect("Content-Type", "application/si-dpo-3d.document+json");
        
        expect(()=>JSON.parse(text)).not.to.throw()
        expect(JSON.parse(text)).to.deep.equal(JSON.parse(c));
      });

      it("rejects invalid JSON documents", async function(){
        let c = `xxx`
        await this.agent.put("/scenes/foo/foo.svx.json")
        .set("Content-Type", "application/octet-stream")
        .send(c)
        .expect(400);
      });


      it("can grant permissions", async function(){
        let dave = await userManager.addUser("dave", "12345678");
        await this.agent.patch("/auth/access/foo")
        .send({username: "dave", access: "write"})
        .expect(204);

        let r = await this.agent.get("/auth/access/foo")
        .expect(200)
        .expect("Content-Type", "application/json; charset=utf-8");
        expect(r, JSON.stringify(r.body)).to.have.property("body").to.have.deep.members([
        {uid:user.uid, username: user.username, access: "admin"},
          {uid:dave.uid, username: dave.username, access: "write"}
        ]);
      });

      it("can remove a user's special permissions", async function(){
        let r = await this.agent.get("/auth/access/foo")
        .expect(200)
        .expect("Content-Type", "application/json; charset=utf-8");
        expect(r).to.have.property("body").to.deep.equal([
          {username: user.username, uid: user.uid, access: "admin"},
        ]);

        await this.agent.patch("/auth/access/foo")
        .send({username: user.username, access: null})
        .expect(204);

        r = await this.agent.get("/auth/access/foo")
        .expect(200)
        .expect("Content-Type", "application/json; charset=utf-8");
        expect(r).to.have.property("body").to.deep.equal([]);

      });
    });
  });
  describe("(user)", function(){
    let eve;
    this.beforeEach(async function(){
      eve = await userManager.addUser("eve", "12345678");

      this.agent = request.agent(this.server);
      await this.agent.post("/auth/login")
      .send({username: eve.username, password: "12345678"})
      .set("Content-Type", "application/json")
      .set("Accept", "")
      .expect(200);
    });
    it("can't edit other people's models (obfuscated as 404)", async function(){
      await this.agent.put("/scenes/foo/models/foo.glb").send("foo\n").expect(404);
    });
    it.skip("can be granted permissions", async function(){
      
    })
  });
})

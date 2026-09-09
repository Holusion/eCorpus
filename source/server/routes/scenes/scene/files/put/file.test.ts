
import request from "supertest";

import User, { UserLevels } from "../../../../../auth/User.js";
import UserManager from "../../../../../auth/UserManager.js";
import { NotFoundError } from "../../../../../utils/errors.js";
import Vfs from "../../../../../vfs/index.js";



describe("PUT /scenes/:scene/:filename(.*)", function(){
  
  let vfs :Vfs, userManager :UserManager, user :User, user2: User, admin :User, scene_id :number;

  this.beforeAll(async function(){
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager = locals.userManager;
  });
  this.beforeEach(async function(){
    await resetIntegrationContext(this);
    user = await userManager.addUser("bob", "12345678");
    user2 = await userManager.addUser("bob2", "12345678");
    admin = await userManager.addUser("alice", "12345678", "admin");
    scene_id = await vfs.createScene("foo");
    await userManager.setDefaultAccess(scene_id, "write");
    await userManager.grant(scene_id, user.uid, "admin");
    await vfs.writeDoc("{}", {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
  });

  it("can PUT a file into a scene", async function(){
    await request(this.server).put("/scenes/foo/articles/foo.html")
    .set("Content-Type", "text/plain")
    .set("Authorization", await bearer(user2.username))
    .expect(201);
    let {ctime, mtime, id, ...file} =  await vfs.getFileProps({scene:"foo", name:"articles/foo.html"});
    expect(id).to.be.a("number");
    expect(file).to.deep.equal({
      size: 0,
      hash: '47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU',
      generation: 1,
      name: 'articles/foo.html',
      mime: 'text/html',
      author_id: user2.uid,
      author: user2.username
    });
    expect(mtime).to.be.instanceof(Date);
    expect(ctime).to.be.instanceof(Date);
  });

  it("can put an extensionless file with proper headers", async function(){

    await request(this.server).put("/scenes/foo/articles/foo")
    .set("Authorization", await bearer(user.username))
    .set("Content-Type", "text/html")
    .expect(201);
    let {ctime, mtime, id, ...file} =  await vfs.getFileProps({scene:"foo", name:"articles/foo"});
    expect(file).to.deep.equal({
      size: 0,
      hash: '47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU',
      generation: 1,
      name: 'articles/foo',
      mime: 'text/html',
      author_id: user.uid,
      author: user.username,
    });
  });

  it("requires write permission", async function(){
    await userManager.setPublicAccess("foo", "read");

    await request(this.server).put("/scenes/foo/articles/foo.html")
    .set("Content-Type", "text/html")
    .expect(401);

    await expect(vfs.getFileProps({scene: "foo", name:"articles/foo.html"})).to.be.rejectedWith(NotFoundError);
  });

  it("can write article data into the database", async function(){

    await request(this.server).put("/scenes/foo/articles/foo")
    .set("Authorization", await bearer(user.username))
    .set("Content-Type", "text/html")
    .send("<h1>New Article</h1>")
    .expect(201);
    let {ctime, mtime, id, ...file} =  await vfs.getFileProps({scene:"foo", name:"articles/foo"},true);
    expect(file).to.deep.equal({
      size: 20,
      hash: '2bsBMDkdCMe3_5A_qv5p2Q3hIenv1289pWLQwlB8bNo',
      generation: 1,
      name: 'articles/foo',
      mime: 'text/html',
      data: '<h1>New Article</h1>',
      author_id: user.uid,
      author: user.username,
    });
  });

  describe("ETag", function(){

    it("reports the stored hash", async function(){
      const res = await request(this.server).put("/scenes/foo/articles/foo.html")
      .set("Authorization", await bearer(user.username))
      .set("Content-Type", "text/html")
      .send("<h1>New Article</h1>")
      .expect(201);

      const {hash} = await vfs.getFileProps({scene:"foo", name:"articles/foo.html"});
      expect(res.headers).to.have.property("etag", `"${hash}"`);
    });

    it("matches what a GET of the same file returns", async function(){
      const put = await request(this.server).put("/scenes/foo/articles/foo.html")
      .set("Authorization", await bearer(user.username))
      .set("Content-Type", "text/html")
      .send("<h1>New Article</h1>")
      .expect(201);

      const get = await request(this.server).get("/scenes/foo/articles/foo.html")
      .set("Authorization", await bearer(user.username))
      .expect(200);

      expect(put.headers.etag).to.equal(get.headers.etag);
    });
  });

  describe("If-Match", function(){

    /** Writes an article and returns the ETag of the stored version */
    async function writeArticle(server :any, username :string, content :string) :Promise<string>{
      const res = await request(server).put("/scenes/foo/articles/foo.html")
      .set("Authorization", await bearer(username))
      .set("Content-Type", "text/html")
      .send(content);
      expect(res.status, res.text).to.be.oneOf([200, 201]);
      return res.headers.etag;
    }

    it("writes when the precondition holds", async function(){
      const etag = await writeArticle(this.server, user.username, "<h1>One</h1>");

      await request(this.server).put("/scenes/foo/articles/foo.html")
      .set("Authorization", await bearer(user.username))
      .set("Content-Type", "text/html")
      .set("If-Match", etag)
      .send("<h1>Two</h1>")
      .expect(200);

      const {data} = await vfs.getFileProps({scene:"foo", name:"articles/foo.html"}, true);
      expect(data).to.equal("<h1>Two</h1>");
    });

    it("refuses a write over someone else's change", async function(){
      //What the editor is actually asking: is this save overwriting the copy I read?
      const stale = await writeArticle(this.server, user.username, "<h1>One</h1>");
      await writeArticle(this.server, user2.username, "<h1>Someone else</h1>");

      await request(this.server).put("/scenes/foo/articles/foo.html")
      .set("Authorization", await bearer(user.username))
      .set("Content-Type", "text/html")
      .set("If-Match", stale)
      .send("<h1>Two</h1>")
      .expect(412);

      const {data, generation} = await vfs.getFileProps({scene:"foo", name:"articles/foo.html"}, true);
      expect(data, "the other user's version must survive").to.equal("<h1>Someone else</h1>");
      expect(generation, "and no generation may be written").to.equal(2);
    });

    it("names the current version when it refuses", async function(){
      const stale = await writeArticle(this.server, user.username, "<h1>One</h1>");
      const current = await writeArticle(this.server, user2.username, "<h1>Someone else</h1>");

      const res = await request(this.server).put("/scenes/foo/articles/foo.html")
      .set("Authorization", await bearer(user.username))
      .set("Content-Type", "text/html")
      .set("If-Match", stale)
      .send("<h1>Two</h1>")
      .expect(412);

      expect(res.headers).to.have.property("etag", current);
    });

    it("accepts any of a list of tags", async function(){
      const etag = await writeArticle(this.server, user.username, "<h1>One</h1>");

      await request(this.server).put("/scenes/foo/articles/foo.html")
      .set("Authorization", await bearer(user.username))
      .set("Content-Type", "text/html")
      .set("If-Match", `"nonesuch", ${etag}`)
      .send("<h1>Two</h1>")
      .expect(200);
    });

    it("refuses a weak tag", async function(){
      //Strong comparison, per RFC 9110: a weak validator says nothing about the bytes.
      const etag = await writeArticle(this.server, user.username, "<h1>One</h1>");

      await request(this.server).put("/scenes/foo/articles/foo.html")
      .set("Authorization", await bearer(user.username))
      .set("Content-Type", "text/html")
      .set("If-Match", `W/${etag}`)
      .send("<h1>Two</h1>")
      .expect(412);
    });

    it("`*` requires the file to already exist", async function(){
      await request(this.server).put("/scenes/foo/articles/nothere.html")
      .set("Authorization", await bearer(user.username))
      .set("Content-Type", "text/html")
      .set("If-Match", "*")
      .send("<h1>Two</h1>")
      .expect(412);

      await writeArticle(this.server, user.username, "<h1>One</h1>");
      await request(this.server).put("/scenes/foo/articles/foo.html")
      .set("Authorization", await bearer(user.username))
      .set("Content-Type", "text/html")
      .set("If-Match", "*")
      .send("<h1>Two</h1>")
      .expect(200);
    });

    it("refuses a write over a deleted file", async function(){
      const stale = await writeArticle(this.server, user.username, "<h1>One</h1>");
      await vfs.removeFile({scene:"foo", name:"articles/foo.html", user_id: user2.uid});

      await request(this.server).put("/scenes/foo/articles/foo.html")
      .set("Authorization", await bearer(user.username))
      .set("Content-Type", "text/html")
      .set("If-Match", stale)
      .send("<h1>Two</h1>")
      .expect(412);
    });

    it("applies to binary uploads too", async function(){
      const first = await request(this.server).put("/scenes/foo/models/foo.glb")
      .set("Authorization", await bearer(user.username))
      .set("Content-Type", "model/gltf-binary")
      .send("foo")
      .expect(201);

      await request(this.server).put("/scenes/foo/models/foo.glb")
      .set("Authorization", await bearer(user2.username))
      .set("Content-Type", "model/gltf-binary")
      .send("bar")
      .expect(200);

      await request(this.server).put("/scenes/foo/models/foo.glb")
      .set("Authorization", await bearer(user.username))
      .set("Content-Type", "model/gltf-binary")
      .set("If-Match", first.headers.etag)
      .send("baz")
      .expect(412);
    });
  });
});

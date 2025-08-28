
import request from "supertest";

import User, { UserLevels } from "../../../../../auth/User.js";
import UserManager from "../../../../../auth/UserManager.js";
import { NotFoundError } from "../../../../../utils/errors.js";
import Vfs from "../../../../../vfs/index.js";



describe("PUT /scenes/:scene/:filename(.*)", function(){
  
  let vfs :Vfs, userManager :UserManager, user :User, user2: User, admin :User, scene_id :number;

  this.beforeEach(async function(){
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager = locals.userManager;
    user = await userManager.addUser("bob", "12345678");
    user2 = await userManager.addUser("bob2", "12345678");
    admin = await userManager.addUser("alice", "12345678", "admin");
    scene_id = await vfs.createScene("foo");
    await userManager.setDefaultAccess(scene_id, "write");
    await userManager.grant(scene_id, user.uid, "admin"); 
    await vfs.writeDoc("{}", {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});

  });
  this.afterEach(async function(){
    await cleanIntegrationContext(this);
  });

  it("can PUT a file into a scene", async function(){
    await request(this.server).put("/scenes/foo/articles/foo.html")
    .set("Content-Type", "text/plain")
    .auth(user2.username,"12345678")
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
    .auth(user.username, "12345678")
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
    .auth(user.username, "12345678")
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
});

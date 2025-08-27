import request from "supertest";
import { expect } from "chai";

import User, { UserLevels } from "../../../../../auth/User.js";
import UserManager from "../../../../../auth/UserManager.js";
import Vfs from "../../../../../vfs/index.js";
import { WriteFileParams } from "../../../../../vfs/types.js";




describe("MOVE /scenes/:name", function(){
  let vfs :Vfs, userManager :UserManager, user :User, admin :User, scene_id :number;
  this.beforeEach(async function(){
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager = locals.userManager;
    user = await userManager.addUser("bob", "12345678");
    admin = await userManager.addUser("alice", "12345678", "admin");

    scene_id = await vfs.createScene("foo", user.uid);
    await vfs.writeDoc("{}", {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
    await vfs.writeFile(dataStream(), {scene: "foo", mime:"model/gltf-binary", name: "models/foo.glb", user_id: user.uid});


    this.agent = request.agent(this.server);
    await this.agent.post("/auth/login")
    .send({username: user.username, password: "12345678"})
    .set("Content-Type", "application/json")
    .set("Accept", "")
    .expect(200);
  });
  this.afterEach(async function(){
    await cleanIntegrationContext(this);
  });


  it("can MOVE a file", async function(){
    let props :WriteFileParams = {user_id: null, scene: "foo", mime: "text/html", name:"articles/hello-world.html"};
    await vfs.writeFile(dataStream(), props);
    await this.agent.move("/scenes/foo/articles/hello-world.html")
    .set("Destination", "http://localhost:8000/scenes/foo/articles/goodbye-world.html")
    .expect(201);
    await expect(vfs.getFileProps(props), "old file should not exist anymore").to.be.rejectedWith("404");
    await expect(vfs.getFileProps({...props, name: "articles/goodbye-world.html"}), "new file should have been created").to.be.fulfilled;
  });

  it("MOVE requires a proper Destination header", async function(){
    let props :WriteFileParams = {user_id: null, scene: "foo", mime: "text/html", name:"articles/hello-world.html"};
    await vfs.writeFile(dataStream(), props);
    await this.agent.move("/scenes/foo/articles/hello-world.html")
    .expect(400);
  });

  it("can't MOVE to another scene", async function(){
    let props :WriteFileParams = {user_id: null, scene: "foo", mime: "text/html", name:"articles/hello-world.html"};
    await vfs.createScene("bar");
    await vfs.writeFile(dataStream(), props);
    await this.agent.move("/scenes/foo/articles/hello-world.html")
    .set("Destination", "http://localhost:8000/scenes/bar/articles/hello-world.html")
    .expect(400);
  });

});

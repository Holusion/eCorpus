import { randomBytes } from "crypto";
import request from "supertest";
import { expect } from "chai";

import User from "../../../auth/User.js";
import UserManager from "../../../auth/UserManager.js";
import { NotFoundError } from "../../../utils/errors.js";
import Vfs from "../../../vfs/index.js";




describe("DELETE /scenes/:scene", function(){
  let vfs :Vfs, userManager :UserManager, user :User, other: User, admin :User, scene_id :number;
  let titleSlug :string;
  this.beforeAll(async function(){
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager = locals.userManager;
    user = await userManager.addUser("bob", "12345678");
    other = await userManager.addUser("oscar", "12345678");
    admin = await userManager.addUser("alice", "12345678", true);

  });
  this.afterAll(async function(){
    await cleanIntegrationContext(this);
  });

  this.beforeEach(async function(){
    //Initialize a unique scene for each test
    titleSlug = this.currentTest?.title.replace(/[^\w]/g, "_").slice(0,15)+"_"+randomBytes(4).toString("base64url");
    scene_id = await vfs.createScene(titleSlug, user.uid);
  });


  it("can delete a scene", async function(){
    await request(this.server).delete(`/scenes/${titleSlug}`)
    .auth(user.username, "12345678")
    .expect(204);

    await request(this.server).get(`/scenes/${titleSlug}`)
    .expect(404);
  });

  it("can delete as administrator", async function(){
    await request(this.server).delete(`/scenes/${titleSlug}`)
    .auth(admin.username, "12345678")
    .expect(204);
  });

  it("can't delete unauthenticated", async function(){
    await request(this.server).delete(`/scenes/${titleSlug}`)
    .expect(401);
  });

  it("can't delete as another user", async function(){
    await request(this.server).delete(`/scenes/${titleSlug}`)
    .auth(other.username, "12345678")
    .expect(401);
  });

  it("can create a scene back after deletion", async function(){
    await request(this.server).delete(`/scenes/${titleSlug}`)
    .auth(user.username, "12345678")
    .expect(204);

    await request(this.server).mkcol(`/scenes/${titleSlug}`)
    .auth(user.username, "12345678")
    .expect(201);
  });

  it("can't delete scene more than once", async function(){
    await request(this.server).delete(`/scenes/${titleSlug}`)
    .auth(user.username, "12345678")
    .expect(204);

    await request(this.server).delete(`/scenes/${titleSlug}`)
    .auth(user.username, "12345678")
    .expect(404);
  });

  it.skip("can restore an archived scene", async function(){
    

  });

  it("requires superadmin to force delete", async function(){

    await request(this.server).delete(`/scenes/${titleSlug}?archive=false`)
    .auth(user.username, "12345678")
    .expect(401);
    await expect(vfs.getScene(scene_id)).to.be.fulfilled;
  });

  it("can force delete a scene", async function(){
    await request(this.server).delete(`/scenes/${titleSlug}?archive=false`)
    .auth(admin.username, "12345678")
    .expect(204);
    await expect(vfs.getScene(scene_id)).to.be.rejectedWith(NotFoundError);
  });

  it("can force delete after archival", async function(){
    await request(this.server).delete(`/scenes/${titleSlug}`)
    .auth(admin.username, "12345678")
    .expect(204);

    await request(this.server).delete(`/scenes/${titleSlug}${encodeURIComponent("#")+scene_id.toString(10)}?archive=false`)
    .auth(admin.username, "12345678")
    .expect(204);

  })

});

import { randomBytes } from "crypto";
import request from "supertest";
import { expect } from "chai";

import User, { UserLevels } from "../../../auth/User.js";
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
    admin = await userManager.addUser("alice", "12345678", "admin");

  });

  this.beforeEach(async function(){
    //Initialize a unique scene for each test
    titleSlug = this.currentTest?.title.replace(/[^\w]/g, "_").slice(0,15)+"_"+randomBytes(4).toString("base64url");
    scene_id = await vfs.createScene(titleSlug, user.uid);
  });


  it("can archive a scene", async function(){
    await request(this.server).delete(`/scenes/${titleSlug}`)
    .set("Authorization", await bearer(user.username))
    .expect(204);

    await request(this.server).get(`/scenes/${titleSlug}`)
    .expect(404);
  });

  it("can delete as administrator", async function(){
    await request(this.server).delete(`/scenes/${titleSlug}`)
    .set("Authorization", await bearer(admin.username))
    .expect(204);
  });

  it("can't delete unauthenticated", async function(){
    await request(this.server).delete(`/scenes/${titleSlug}`)
    .expect(401);
  });

  it("can't delete as another user", async function(){
    await request(this.server).delete(`/scenes/${titleSlug}`)
    .set("Authorization", await bearer(other.username))
    .expect(401);
  });

  it("can create a scene back after archival", async function(){
    await request(this.server).delete(`/scenes/${titleSlug}`)
    .set("Authorization", await bearer(user.username))
    .expect(204);
    //We can create a scene with the deleted name because the archival renames it
    await request(this.server).mkcol(`/scenes/${titleSlug}`)
    .set("Authorization", await bearer(user.username))
    .expect(201);
  });

  it("can't delete scene more than once", async function(){
    await request(this.server).delete(`/scenes/${titleSlug}`)
    .set("Authorization", await bearer(user.username))
    .expect(204);

    await request(this.server).delete(`/scenes/${titleSlug}`)
    .set("Authorization", await bearer(user.username))
    .expect(404);
  });

  it("can restore an archived scene", async function(){
    await request(this.server).delete(`/scenes/${titleSlug}`)
    .set("Authorization", await bearer(user.username))
    .expect(204);

    await request(this.server).get(`/scenes/${titleSlug}`)
    .set("Authorization", await bearer(user.username))
    .expect(404);

    await request(this.server).patch(`/scenes/${encodeURIComponent(titleSlug+"#"+scene_id)}`)
    .set("Authorization", await bearer(user.username))
    .send({archived: false})
    .expect(200);

    await request(this.server).get(`/scenes/${titleSlug}`)
    .set("Authorization", await bearer(user.username))
    .expect(200);
  });

  it("requires superadmin to force delete", async function(){

    await request(this.server).delete(`/scenes/${titleSlug}?archive=false`)
    .set("Authorization", await bearer(user.username))
    .expect(401);
    await expect(vfs.getScene(scene_id)).to.be.fulfilled;
  });

  it("can force delete a scene", async function(){
    await request(this.server).delete(`/scenes/${titleSlug}?archive=false`)
    .set("Authorization", await bearer(admin.username))
    .expect(204);
    await expect(vfs.getScene(scene_id)).to.be.rejectedWith(NotFoundError);
  });

  it("can truly delete after archival", async function(){
    await request(this.server).delete(`/scenes/${titleSlug}`)
    .set("Authorization", await bearer(admin.username))
    .expect(204);

    await request(this.server).delete(`/scenes/${encodeURIComponent(`${titleSlug}#${scene_id.toString(10)}`)}?archive=false`)
    .set("Authorization", await bearer(admin.username))
    .expect(204);

  })

});

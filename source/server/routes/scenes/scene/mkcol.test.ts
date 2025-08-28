import { randomBytes } from "crypto";
import request from "supertest";
import { expect } from "chai";

import User, { UserLevels } from "../../../auth/User.js";
import UserManager from "../../../auth/UserManager.js";
import Vfs from "../../../vfs/index.js";



describe("MKCOL /scenes/:scene", function(){
  let vfs :Vfs, userManager :UserManager, user :User, admin :User, scene_id :number;
  let titleSlug :string;
  this.beforeAll(async function(){
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager = locals.userManager;
    user = await userManager.addUser("bob", "12345678");
    admin = await userManager.addUser("alice", "12345678", "admin");

  });
  this.afterAll(async function(){
    await cleanIntegrationContext(this);
  });

  this.beforeEach(async function(){
    //Initialize a unique scene for each test
    titleSlug = this.currentTest?.title.replace(/[^\w]/g, "_").slice(0,15)+"_"+randomBytes(4).toString("base64url");
    scene_id = await vfs.createScene(titleSlug, user.uid);
  });

  it("can create a scene", async function(){
    const r = await request(this.server).mkcol(`/scenes/2${titleSlug}`)
    .auth(user.username, "12345678")
    .expect(201);
  });

  it("won't overwrite existing scene", async function(){
    await request(this.server).mkcol(`/scenes/${titleSlug}`)
    .auth(admin.username, "12345678")
    .expect(409);
  });
});

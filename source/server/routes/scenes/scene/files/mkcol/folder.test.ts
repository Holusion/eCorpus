import { randomBytes } from "crypto";
import request from "supertest";
import { expect } from "chai";

import User from "../../../../../auth/User.js";
import UserManager from "../../../../../auth/UserManager.js";
import Vfs from "../../../../../vfs/index.js";
import { collapseAsync } from "../../../../../utils/wrapAsync.js";




describe("MKCOL /scenes/:scene/.*", function(){
  let vfs :Vfs, userManager :UserManager, user :User, admin :User, scene_id :number;
  let titleSlug :string;
  this.beforeAll(async function(){
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager = locals.userManager;
    user = await userManager.addUser("bob", "12345678");
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

  it("can create a folder", async function(){
    await request(this.server).mkcol(`/scenes/${titleSlug}/new_folder`)
    .auth(user.username, "12345678")
    .expect(201);

    let folders = await collapseAsync(vfs.listFolders(scene_id));
    expect(folders.map(f=>f.name)).to.have.members(["articles", "new_folder", "models"]);

  });

  it("can create a folder with trailing slash", async function(){
    await request(this.server).mkcol(`/scenes/${titleSlug}/new_folder`)
    .auth(user.username, "12345678")
    .expect(201);

    let folders = await collapseAsync(vfs.listFolders(scene_id));
    expect(folders.map(f=>f.name)).to.have.members(["articles", "new_folder", "models"]);

  });

  it("rejects bad names", async function(){
    let badNames = [
      "/",
      "/foo",
      ".anything" //Simply rejects any hidden directory as we have no use for them
    ];
    for (let name of badNames){
      let res = await request(this.server).mkcol(`/scenes/${titleSlug}/${name}`)
      .auth(user.username, "12345678")
      expect(res.status, `[${res.status}] MKCOL /scenes/${titleSlug}/${name} (expected 400)`).to.equal(400);
    }
    let self = [
      ".",
      "articles/..",

    ]
    for (let name of self){
      let res = await request(this.server).mkcol(`/scenes/${titleSlug}/${name}`)
      .auth(user.username, "12345678")
      expect(res.status, `[${res.status}] MKCOL /scenes/${titleSlug}/${name} (expected 409)`).to.equal(409);
    }
    
    let parents = [
      "..",
      "../..",
      "../../..",
    ];
    for(let name of parents){
      let res = await request(this.server).mkcol(`/scenes/${titleSlug}/${name}`)
      .auth(user.username, "12345678")
      expect(res.status, `[${res.status}] MKCOL /scenes/${titleSlug}/${name} (expected 404)`).to.equal(404);
    }
  });

  it("requires write access", async function(){
    await request(this.server).mkcol(`/scenes/${titleSlug}/new_folder`)
    .expect(401);
  })
});

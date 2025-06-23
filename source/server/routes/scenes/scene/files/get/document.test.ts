import fs from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import { fileURLToPath } from 'url';

import request from "supertest";

import User, { UserLevels } from "../../../../../auth/User.js";
import UserManager from "../../../../../auth/UserManager.js";
import Vfs from "../../../../../vfs/index.js";

import { fixturesDir } from "../../../../../__test_fixtures/fixtures.js";


describe("GET /scenes/:scene/scene.svx.json", function(){
  
  let vfs :Vfs, userManager :UserManager, user :User, admin :User;
  let sampleDocString :string;
  let titleSlug :string, scene_id :number, sampleDoc :any;

  this.beforeAll(async function(){
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager = locals.userManager;
    user = await userManager.addUser("bob", "12345678");
    admin = await userManager.addUser("alice", "12345678", "admin");

    sampleDocString = await fs.readFile(path.resolve(fixturesDir, "documents/01_simple.svx.json"), {encoding:"utf8"});
  });

  this.afterAll(async function(){
    await cleanIntegrationContext(this);
  });

  this.beforeEach(async function(){
    //Initialize a unique scene for each test
    titleSlug = this.currentTest?.title.replace(/[^\w]/g, "_").slice(0, 15)+"_"+randomBytes(4).toString("base64url");
    scene_id = await vfs.createScene(titleSlug, user.uid);
    sampleDoc = JSON.parse(sampleDocString);
    await vfs.writeDoc(sampleDocString, {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
  });


  it("inserts a generation id into the document", async function(){
    let {id} = await vfs.getDoc(titleSlug);
    expect(id).to.be.a("number");
    let res = await request(this.server).get(`/scenes/${titleSlug}/scene.svx.json`)
    .auth("bob", "12345678")
    .expect(200)
    .expect("Content-Type", "application/si-dpo-3d.document+json");

    expect(JSON.parse(res.text)).to.have.property("asset").to.have.property("id", id);
  });

});

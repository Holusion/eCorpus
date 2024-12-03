import { randomBytes } from "crypto";
import request from "supertest";
import User from "../../../auth/User.js";
import UserManager from "../../../auth/UserManager.js";
import Vfs from "../../../vfs/index.js";



/**
 * Minimal tests as most
 */

describe("GET /auth/access/:scene", function(){
  let vfs :Vfs, userManager :UserManager, user :User, admin :User, opponent :User;

  let titleSlug :string, scene_id :number;
  this.beforeAll(async function(){
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager = locals.userManager;
    user = await userManager.addUser("bob", "12345678");
    admin = await userManager.addUser("alice", "12345678", true);
    opponent = await userManager.addUser("oscar", "12345678");
  });

  this.afterAll(async function(){
    await cleanIntegrationContext(this);
  });
  this.beforeEach(async function(){
    //Initialize a unique scene for each test
    titleSlug = this.currentTest?.title.replace(/[^\w]/g, "_").slice(0,15)+"_"+randomBytes(4).toString("base64url");
    scene_id = await vfs.createScene(titleSlug, user.uid);
    await vfs.writeDoc("{}", {scene:scene_id, user_id:user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
  });

  it("requires read access", async function(){
    await userManager.grant(titleSlug, "default", "none");
    await userManager.grant(titleSlug, "any", "none");
    //Anonymous
    await request(this.server).get(`/auth/access/${titleSlug}`)
    .expect(404);
    //read-only User 
    await request(this.server).get(`/auth/access/${titleSlug}`)
    .auth(opponent.username, "12345678")
    .expect(404);
  });
});
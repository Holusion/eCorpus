import { randomBytes } from "crypto";
import request from "supertest";
import User, { UserLevels } from "../../../auth/User.js";
import UserManager from "../../../auth/UserManager.js";
import Vfs from "../../../vfs/index.js";



/**
 * Minimal tests as most
 */

describe("GET /admin/config", function(){
  let vfs :Vfs, userManager :UserManager, user :User, admin :User;

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

  it("requires admin access", async function(){
    //Anonymous
    await request(this.server).get(`/admin/config`)
    .expect(401);
    //read-only User 
    await request(this.server).get(`/admin/config`)
    .auth(user.username, "12345678")
    .expect(401);

    await request(this.server).get(`/admin/config`)
    .auth(admin.username, "12345678")
    .expect(200);
  });
  
  it("can return text/plain env file", async function(){
    await request(this.server).get(`/admin/config`)
    .auth(admin.username, "12345678")
    .accept("text/plain")
    .expect(200)
    .expect("Content-Type", "text/plain; charset=utf-8");
  });
  it("can return application/json", async function(){
    await request(this.server).get(`/admin/config`)
    .auth(admin.username, "12345678")
    .accept("application/json")
    .expect(200)
    .expect("Content-Type", "application/json; charset=utf-8");
  });
});
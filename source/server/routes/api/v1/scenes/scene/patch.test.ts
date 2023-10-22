

import request from "supertest";

import Vfs from "../../../../../vfs/index.js";
import UserManager from "../../../../../auth/UserManager.js";

describe("PATCH /api/v1/scenes/:scene", function(){
  let vfs:Vfs, userManager:UserManager, ids :number[];
  this.beforeEach(async function(){
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager  = locals.userManager;
    ids = await Promise.all([
        vfs.createScene("foo", {0:"admin"}),
        vfs.createScene("bar", {0:"admin"}),
    ]);
  });
  
  this.afterEach(async function(){
    await cleanIntegrationContext(this);
  });

  describe("rename a scene", function(){
    it("get scene info", async function(){
      await request(this.server).patch("/api/v1/scenes/foo")
      .send({name: "foofoo"})
      .expect(200);
    });

    it("forces unique names", async function(){
      await request(this.server).patch("/api/v1/scenes/foo")
      .send({name: "bar"})
      .expect(409);
    })

    it("is admin-protected", async function(){
      await userManager.grant("foo", "any", "write");
      await userManager.grant("foo", "default", "write");
      await request(this.server).patch("/api/v1/scenes/foo")
      .send({name: "foofoo"})
      .expect(401);
    });

    it("is access-protected (obfuscated as 404)", async function(){
      await userManager.grant("foo", "default", "none");
      await request(this.server).patch("/api/v1/scenes/foo")
      .send({name: "foofoo"})
      .expect(404);
    });
  });

});

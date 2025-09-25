
import request from "supertest";
import Vfs from "../../vfs/index.js";
import User from "../../auth/User.js";
import UserManager from "../../auth/UserManager.js";



/**
 * Minimal tests as most
 */

describe("GET /history/:scene", function(){
  let vfs :Vfs, userManager :UserManager, user :User, admin :User, opponent :User;

  describe("with sample data", function(){
    let now :Date, scene_id :number;
    this.beforeAll(async function(){
      let locals = await createIntegrationContext(this);
      vfs = locals.vfs;
      userManager = locals.userManager;
      user = await userManager.addUser("bob", "12345678");
      admin = await userManager.addUser("alice", "12345678", "admin");
      opponent = await userManager.addUser("oscar", "12345678");

      now = new Date();
      scene_id = await vfs.createScene("foo", user.uid);
      await Promise.all([
        vfs.writeFile(dataStream(), {scene: "foo", name:"articles/foo.txt", mime:"text/plain", user_id: user.uid}),
        vfs.writeDoc("{}", {scene: "foo", user_id:user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"} ),
      ]);
      await vfs.removeFile({scene: "foo", name:"articles/foo.txt", mime:"text/plain", user_id: user.uid});
      await vfs.writeFile(dataStream(), {scene: "foo", name:"articles/foo.txt", mime:"text/plain", user_id: user.uid});


      //Ensure proper dates
      await vfs._db.run(`
        UPDATE files SET ctime = $1;
      `, [now]);
    });
  
    this.afterAll(async function(){
      await cleanIntegrationContext(this);
    });

    it("get a scene's history", async function(){
      let res = await request(this.server).get("/history/foo")
      .auth(user.username, "12345678")
      .set("Accept", "application/json")
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");

      expect(res.body.map((i:any)=>([i.name, i.generation]))).to.deep.equal([
        ["scene.svx.json", 1],
        ["models", 1],
        ["articles/foo.txt", 3],
        ["articles/foo.txt", 2],
        ["articles/foo.txt", 1],
        ["articles", 1],
      ]);
    });

    it("get text history", async function(){
      let res = await request(this.server).get("/history/foo")
      .auth(user.username, "12345678")
      .set("Accept", "text/plain")
      .expect(200)
      .expect("Content-Type", "text/plain; charset=utf-8");
    });


    it("get an empty history", async function(){
      await vfs.createScene("empty", user.uid);
      let res = await request(this.server).get("/history/empty")
      .auth(user.username, "12345678")
      .expect(200);
    });

    it("can ?limit results", async function(){
      let res = await request(this.server).get("/history/foo?limit=1")
      .auth(user.username, "12345678")
      .set("Accept", "application/json")
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");

      expect(res.body.map((i:any)=>([i.name, i.generation]))).to.deep.equal([
        ["scene.svx.json", 1],
      ]);
    });

    it("can ?offset results", async function(){
      let res = await request(this.server).get("/history/foo?limit=1&offset=1")
      .auth(user.username, "12345678")
      .set("Accept", "application/json")
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");

      expect(res.body.map((i:any)=>([i.name, i.generation]))).to.deep.equal([
        ["models", 1],
      ]);
    });

    describe("requires write access", function(){
      this.beforeAll(async function(){
        await vfs.createScene("private", user.uid);
        await userManager.setPublicAccess("private", "read");
        await userManager.setDefaultAccess("private", "read");
      });
      it("(anonymous)", async function(){
        await request(this.server).get("/history/private")
        .expect(404);
      });
  
      it("(user)", async function(){
        await request(this.server).get("/history/private")
        .auth(opponent.username, "12345678")
        .expect(404);
      });
    })
  })
});

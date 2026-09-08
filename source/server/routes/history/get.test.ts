
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
  

    it("get a scene's history", async function(){
      let res = await request(this.server).get("/history/foo")
      .set("Authorization", await bearer(user.username))
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
      .set("Authorization", await bearer(user.username))
      .set("Accept", "text/plain")
      .expect(200)
      .expect("Content-Type", "text/plain; charset=utf-8");
    });


    it("get an empty history", async function(){
      await vfs.createScene("empty", user.uid);
      let res = await request(this.server).get("/history/empty")
      .set("Authorization", await bearer(user.username))
      .expect(200);
    });

    it("can ?limit results", async function(){
      let res = await request(this.server).get("/history/foo?limit=1")
      .set("Authorization", await bearer(user.username))
      .set("Accept", "application/json")
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");

      expect(res.body.map((i:any)=>([i.name, i.generation]))).to.deep.equal([
        ["scene.svx.json", 1],
      ]);
    });

    it("can ?offset results", async function(){
      let res = await request(this.server).get("/history/foo?limit=1&offset=1")
      .set("Authorization", await bearer(user.username))
      .set("Accept", "application/json")
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");

      expect(res.body.map((i:any)=>([i.name, i.generation]))).to.deep.equal([
        ["models", 1],
      ]);
    });

    it("exposes the total count via X-Total-Count for pagination", async function(){
      let res = await request(this.server).get("/history/foo?limit=1")
      .set("Authorization", await bearer(user.username))
      .set("Accept", "application/json")
      .expect(200)
      .expect("X-Total-Count", "6");

      expect(res.body).to.have.lengthOf(1);
    });

    describe("requires history:read over a readable scene", function(){
      this.beforeAll(async function(){
        await vfs.createScene("public", user.uid);
        await userManager.setPublicAccess("public", "read");
        await userManager.setDefaultAccess("public", "read");
        await vfs.createScene("private", user.uid);
        await userManager.setPublicAccess("private", "none");
        await userManager.setDefaultAccess("private", "none");
      });

      //Anonymous holds PUBLIC_SCOPES, which has no history:read, so it is
      //refused on the scope *before* the ACL is consulted: the contributors of
      //a publicly readable scene stay unenumerable.
      it("(anonymous, over a public scene)", async function(){
        await request(this.server).get("/history/public")
        .expect(401);
      });

      //Read access is enough for an identified user — including the read that
      //default_access hands out without an explicit grant.
      it("(identified user, read through default_access)", async function(){
        await request(this.server).get("/history/public")
        .set("Authorization", await bearer(opponent.username))
        .expect(200);
      });

      it("(identified user, no access to the scene)", async function(){
        await request(this.server).get("/history/private")
        .set("Authorization", await bearer(opponent.username))
        .expect(404);
      });

      //The point of the scope: history is delegable on its own, so an audit
      //token needs no write scope and stays refused on the write routes.
      it("(read-only audit token)", async function(){
        const auth = await bearer(user.username, ["scenes:read", "history:read"]);
        await request(this.server).get("/history/foo")
        .set("Authorization", auth)
        .expect(200);
        await request(this.server).post("/history/foo")
        .set("Authorization", auth)
        .send({id: 1, label: "nope"})
        .expect(403);
      });

      it("(token carrying every scene scope but not history:read)", async function(){
        await request(this.server).get("/history/foo")
        .set("Authorization", await bearer(user.username, ["scenes:admin"]))
        .expect(403);
      });
    })
  })
});

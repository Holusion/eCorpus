
import request from "supertest";
import User from "../../auth/User.js";
import UserManager from "../../auth/UserManager.js";
import Vfs from "../../vfs/index.js";



describe("GET /tags", function(){
  let vfs :Vfs, userManager :UserManager;
  this.beforeEach(async function(){
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager = locals.userManager;
  });
  this.afterEach(async function(){
    await cleanIntegrationContext(this);
  });

  describe("as user", function(){
    let user :User
    this.beforeEach(async function(){
      user = await userManager.addUser("bob", "12345678");
    });
    this.beforeEach(async function(){
      this.agent = request.agent(this.server);
      await this.agent.post("/auth/login")
      .send({username: user.username, password: "12345678"})
      .set("Content-Type", "application/json")
      .set("Accept", "")
      .expect(200);
    });
    it("get a list of tags", async function(){
      let s1 = await vfs.createScene("foo", user.uid);
      await vfs.addTag("foo", "a");
      await vfs.addTag("foo", "b");
      let {body} = await this.agent.get("/tags")
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");
      let ref = await vfs.getScene(s1, user.uid);
      expect(body).to.deep.equal([{name: "a", size: 1}, {name: "b", size: 1}]);
    });
  });
});

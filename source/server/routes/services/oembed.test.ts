import User from "../../auth/User.js";
import UserManager from "../../auth/UserManager.js";
import Vfs from "../../vfs/index.js";
import request from "supertest";


describe("GET /services/oembed", function(){
  let vfs :Vfs, userManager :UserManager, user :User, admin :User;

  this.beforeAll(async function(){
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager = locals.userManager;
    user = await userManager.addUser("bob", "12345678");
    admin = await userManager.addUser("alice", "12345678", "admin");

    await vfs.createScene("public-scene", user.uid);
    await userManager.setPublicAccess("public-scene", "read");

    await vfs.createScene("private-scene", user.uid);
    await userManager.setPublicAccess("private-scene", "none");
  });

  this.afterAll(async function(){
    await cleanIntegrationContext(this);
  });

  it("sends JSON oembed document", async function(){
    let res = await request(this.server).get(`/services/oembed?format=json&url=${encodeURIComponent("http://localhost/ui/scenes/public-scene/view")}`)
    .expect(200)
    .expect("Content-Type", "application/json; charset=utf-8");
    expect(res.body).to.have.property("version", "1.0");
  });

  it("sends XML oembed document", async function(){
    await request(this.server).get(`/services/oembed?format=xml&url=${encodeURIComponent("http://localhost/ui/scenes/public-scene/view")}`)
    .expect(200)
    .expect("Content-Type", "text/xml; charset=utf-8")
    .expect(/^<\?xml/);
  });

  it("404 if scene does not exist", async function(){
    await request(this.server).get(`/services/oembed?format=xml&url=${encodeURIComponent("http://localhost/ui/scenes/not-a-scene/view")}`)
    .expect(404);
  });

  it("404 if scene is private", async function(){
    await request(this.server).get(`/services/oembed?format=xml&url=${encodeURIComponent("http://localhost/ui/scenes/private-scene/view")}`)
    .expect(404);
  });

  it("accept alternative scene view paths", async function(){
    await Promise.all(["/ui/scenes/public-scene", "/scenes/public-scene"].map(async (pathname)=>{
      await request(this.server).get(`/services/oembed?format=xml&url=${encodeURIComponent("http://localhost"+pathname)}`)
      .expect(200);
    }));
  });
  it("501 if not a scene view URL", async function(){
    await Promise.all(["/ui/", "/ui/scenes/public-scene/edit", "/users/bob"].map(async (pathname)=>{
      await request(this.server).get(`/services/oembed?format=xml&url=${encodeURIComponent("http://localhost"+pathname)}`)
      .expect(404);
    }));
  });

})
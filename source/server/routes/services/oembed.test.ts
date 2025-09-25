import User from "../../auth/User.js";
import UserManager from "../../auth/UserManager.js";
import Vfs from "../../vfs/index.js";
import request from "supertest";


function makeURL(target:string, format :"json"|"xml" ="json"){
  return `/services/oembed?format=${format}&url=${encodeURIComponent(target)}`
}

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


  describe("embed scenes", function(){

    it("sends JSON oembed document", async function(){
      let res = await request(this.server).get(makeURL("http://localhost/ui/scenes/public-scene/view", "json"))
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");
      expect(res.body).to.have.property("version", "1.0");
    });

    it("sends XML oembed document", async function(){
      await request(this.server).get(makeURL("http://localhost/ui/scenes/public-scene/view", "xml"))
      .expect(200)
      .expect("Content-Type", "text/xml; charset=utf-8")
      .expect(/^<\?xml/);
    });

    it("rejects invalid formats", async function(){
      await request(this.server).get(makeURL("http://localhost/ui/scenes/public-scene/view", "foo" as any))
      .expect(501); //Not Implemented
      //If no url is provided, it's a bad request
      await request(this.server).get(`/services/oembed?format=json`)
      .expect(400);
      //Don't allow multiple urls to be provided
      let target = "http://localhost/ui/scenes/public-scene/view";
      await request(this.server).get(makeURL(target)+`&url=${encodeURIComponent(target)}`)
      .expect(400); //Bad Request
    })

    it("404 if scene does not exist", async function(){
      await request(this.server).get(makeURL("http://localhost/ui/scenes/not-a-scene/view", "xml"))
      .expect(404);
    });

    it("404 if scene is private", async function(){
      await request(this.server).get(makeURL("http://localhost/ui/scenes/private-scene/view"))
      .expect(404);
    });

    it("accept alternative scene view paths", async function(){
      await Promise.all(["/ui/scenes/public-scene", "/scenes/public-scene"].map(async (pathname)=>{
        await request(this.server).get(makeURL("http://localhost"+pathname))
        .expect(200);
      }));
    });
    it("501 if not a scene view URL", async function(){
      await Promise.all(["/ui/", "/ui/scenes/public-scene/edit", "/users/bob"].map(async (pathname)=>{
        await request(this.server).get(makeURL(encodeURIComponent("http://localhost"+pathname)))
        .expect(404);
      }));
    });
  });

  describe("embed tags", function(){
    this.beforeAll(async function(){
      await vfs.addTag("public-scene", "Public Tag");
      await vfs.addTag("private-scene", "private-tag");
    });

    it("can query a tag", async function(){
      let res = await request(this.server).get(makeURL("http://localhost/ui/tags/Public%20Tag", "json"))
      .expect(200);
      expect(res.body).to.have.property("title", "Public Tag");
    });

    it("404 if tag does not exist", async function(){
      await request(this.server).get(makeURL("http://localhost/ui/tags/not-a-tag"))
      .expect(404);
    });

    it("404 if scene is private", async function(){
      await request(this.server).get(makeURL("http://localhost/ui/tags/private-tag"))
      .expect(404);
    });

  })

})
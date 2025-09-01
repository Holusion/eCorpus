import User from "../../auth/User.js";
import UserManager from "../../auth/UserManager.js";
import Vfs from "../../vfs/index.js";
import request from "supertest";



describe("GET /services/opensearch.xml", function(){
  let vfs :Vfs;

  //We do not fire a full-blown integration context because no DB calls are expected
  this.beforeAll(async function(){
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
  });

  this.afterAll(async function(){
    await cleanIntegrationContext(this);
  });
  
  it("creates a link to openSearch in views", async function(){
    await request(this.server).get("/ui/")
    .expect(200)
    .expect(/<link rel="search" type="application\/opensearchdescription\+xml" href="http:\/\/(localhost|127.0.0.1|::1):\d+\/services\/opensearch\.xml"/)
  });

  it("sends opensearch description", async function(){
    await request(this.server).get("/services/opensearch.xml")
    .expect(200)
    .expect("Content-Type", "application\/opensearchdescription\+xml; charset=utf-8")
  });
});
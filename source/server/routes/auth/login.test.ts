
import request from "supertest";
import Vfs from "../../vfs/index.js";
import User from "../../auth/User.js";
import UserManager from "../../auth/UserManager.js";



describe("/auth/login", function(){
  let vfs :Vfs, userManager :UserManager, user :User, admin :User;
  this.beforeEach(async function(){
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager = locals.userManager;
    user = await userManager.addUser("bob", "12345678");
    admin = await userManager.addUser("alice", "12345678", true);
  });
  this.afterEach(async function(){
    await cleanIntegrationContext(this);
  });

  it("sets a cookie", async function(){
    this.agent = request.agent(this.server);
    await this.agent.post("/auth/login")
    .send({username: user.username, password: "12345678"})
    .set("Content-Type", "application/json")
    .set("Accept", "")
    .expect(200)
    .expect('set-cookie', /session=/);
  });

  it("can get login status (not connected)", async function(){
    await request(this.server).get("/auth/login")
    .set("Accept", "application/json")
    .expect(200)
    .expect({isAdministrator:false, isDefaultUser: true});
  });
  
  it("can get login status (connected)", async function(){
    this.agent = request.agent(this.server);
    await this.agent.post("/auth/login")
    .send({username: user.username, password: "12345678"})
    .set("Content-Type", "application/json")
    .set("Accept", "")
    .expect(200);
    await this.agent.get("/auth/login")
    .set("Accept", "application/json")
    .expect(200)
    .expect({
      username: user.username, 
      uid: user.uid,
      isAdministrator:false,
      isDefaultUser:false
    });
  });

  it("can get login status (admin)", async function(){
    this.agent = request.agent(this.server);
    await this.agent.post("/auth/login")
    .send({username: admin.username, password: "12345678"})
    .set("Content-Type", "application/json")
    .set("Accept", "")
    .expect(200);
    await this.agent.get("/auth/login")
    .set("Accept", "application/json")
    .expect(200)
    .expect({
      username: admin.username, 
      uid: admin.uid,
      isAdministrator:true,
      isDefaultUser:false
    });
  });

  it("send a proper error if username is missing", async function(){
    this.agent = request.agent(this.server);
    let res = await this.agent.post("/auth/login")
    .send({/*no username */ password: "12345678"})
    .set("Content-Type", "application/json")
    .set("Accept", "")
    .expect(400);
    expect(res.body).to.have.property("message").match(/username not provided/);
  });

  it("send a proper error if password is missing", async function(){
    this.agent = request.agent(this.server);
    let res = await this.agent.post("/auth/login")
    .send({username: user.username /*no password */})
    .set("Content-Type", "application/json")
    .set("Accept", "")
    .expect(400);
    expect(res.body).to.have.property("message").match(/password not provided/);
  });
  
  it("can logout", async function(){
    let agent = request.agent(this.server);
    await agent.post("/auth/login")
    .send({username: user.username, password: "12345678"})
    .set("Content-Type", "application/json")
    .set("Accept", "")
    .expect(200)
    .expect('set-cookie', /session=/);

    await agent.post("/auth/logout")
    .expect(200);

    await agent.get("/auth/login")
    .expect(200)
    .expect({
      isDefaultUser: true,
      isAdministrator: false,
    });
  });
  describe("Authorization header", function(){
    it("can use header to authenticate a request", async function(){
      let res = {
        username: user.username, 
        uid: user.uid,
        isAdministrator: false,
        isDefaultUser: false
      };

      //Manually build the header
      await request(this.server).get("/auth/login")
      .set("Authorization", `Basic ${Buffer.from(`${user.username}:12345678`).toString("base64")}`)
      .set("Accept", "application/json")
      .expect(200)
      .expect(res);

      //make supertest build the header
      await request(this.server).get("/auth/login")
      .auth(user.username, "12345678")
      .set("Accept", "application/json")
      .expect(200)
      .expect(res);
    });
  
    it("rejects bad header", async function(){
      // Missing the "Basic " part
      let res = await request(this.server).get("/auth/login")
      .set("Authorization", `${Buffer.from(`${user.username}:12345678`).toString("base64")}`)
      .expect(200); //Still answers 200, but no login data

      expect(res.body).to.deep.equal({ isAdministrator: false, isDefaultUser: true });
    });
    it("rejects bad user:password", async function(){
      // Missing the "Basic " part
      await request(this.server).get("/auth/login")
      .auth(user.username, "badPassword")
      .expect(401);
    })

  });
});

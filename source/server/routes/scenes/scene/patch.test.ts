import request from "supertest";

import { randomBytes } from "crypto";

import User from "../../../auth/User.js";
import Vfs from "../../../vfs/index.js";
import UserManager from "../../../auth/UserManager.js";

describe("PATCH /scenes/:scene", function(){
  let vfs:Vfs, userManager:UserManager, ids :number[], user: User, sceneAdminUser: User;
  this.beforeEach(async function(){
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager  = locals.userManager;
    sceneAdminUser = await userManager.addUser("alice", "xxxxxxxx");
    user = await userManager.addUser("bob", "xxxxxxxx");
    const fooId = await vfs.createScene("foo");
    await userManager.grant(fooId, sceneAdminUser.uid, "admin");
    const barId = await vfs.createScene("bar")
    await userManager.grant(barId, sceneAdminUser.uid, "admin");
    ids = [fooId, barId];
  });
  
  this.afterEach(async function(){
    await cleanIntegrationContext(this);
  });

  describe("name", function(){
    it("can rename", async function(){
      await request(this.server).patch("/scenes/foo")
      .set("Content-Type", "application/json")
      .auth(sceneAdminUser.username, "xxxxxxxx")
      .send({name: "foofoo"})
      .expect(200);
    });

    it("forces unique names", async function(){
      await request(this.server).patch("/scenes/foo")
      .set("Content-Type", "application/json")
      .auth(sceneAdminUser.username, "xxxxxxxx")
      .send({name: "bar"})
      .expect(409);
    })

    it("is admin-protected", async function(){
      await userManager.setPublicAccess("foo", "read");
      await userManager.setDefaultAccess("foo", "write");
      await request(this.server).patch("/scenes/foo")
      .set("Content-Type", "application/json")
      .auth(user.username, "xxxxxxxx")
      .send({name: "foofoo"})
      .expect(401);
    });

    it("is access-protected (obfuscated as 404)", async function(){
      await userManager.setPublicAccess("foo", "none");
      await request(this.server).patch("/scenes/foo")
      .set("Content-Type", "application/json")
      .send({name: "foofoo"})
      .expect(404);
    });
  });

  describe("tags", async function(){
    it("add", async function(){
      let r = await request(this.server).patch("/scenes/foo")
      .send({tags: ["foo", "bar"]})
      .auth(sceneAdminUser.username, "xxxxxxxx")
      .expect(200);

      expect(r.body).to.have.property("tags").to.deep.equal(["foo", "bar"]);
    })    
    
    it("trims tag names", async function(){
      let r = await request(this.server).patch("/scenes/foo")
      .send({tags: [" foo"]})
      .auth(sceneAdminUser.username, "xxxxxxxx")
      .expect(200);

      expect(r.body).to.have.property("tags").to.deep.equal(["foo"])

      //Also trim when comparing with existing tags
      r = await request(this.server).patch("/scenes/foo")
      .send({tags: [" foo"]})
      .auth(sceneAdminUser.username, "xxxxxxxx")
      .expect(200);
      expect(r.body, `existing tag should be compared with the trimmed tag name`).to.have.property("tags").to.deep.equal(["foo"])
    });

    it("can submit an empty value", async function(){
      //When using form elements, it's tricky to generate a request like `{tags:["foo"]}`.
      //So we make it `{tags:""}` when empty  or {tags:["foo", ""]}` when one value is set
      //Through the addition of a hidden empty input field
      let r = await request(this.server).patch("/scenes/foo")
      .send({tags: ["foo", ""]})
      .auth(sceneAdminUser.username, "xxxxxxxx")
      .expect(200);

      expect(r.body).to.have.property("tags").to.deep.equal(["foo"]);

      //Unset the tag we just made
      r = await request(this.server).patch("/scenes/foo")
      .auth(sceneAdminUser.username, "xxxxxxxx")
      .send({tags: ""})
      .expect(200);

      expect(r.body).to.have.property("tags").to.deep.equal([]);



      //Set it back with two values
      r = await request(this.server).patch("/scenes/foo")
      .auth(sceneAdminUser.username, "xxxxxxxx")
      .send({tags: ["foo", "bar", ""]})
      .expect(200);

      expect(r.body).to.have.property("tags").to.deep.equal(["foo", "bar"]);

      //An array with only an empty string will probable never get sent but that's still tested
      r = await request(this.server).patch("/scenes/foo")
      .auth(sceneAdminUser.username, "xxxxxxxx")
      .send({tags: [""]})
      .expect(200);

      expect(r.body).to.have.property("tags").to.deep.equal([])
    });

    
  })

  describe("archive", function(){
    it("can archive a scene", async function(){

      let r = await request(this.server).patch("/scenes/foo")
      .send({archived: true})
      .auth(sceneAdminUser.username, "xxxxxxxx")
      .expect(200);

      expect(r.body).to.have.property("archived").not.to.be.null;
      expect(r.body).to.have.property("name").to.equal(`foo#${ids[0]}`);
    });

    it("can restore a scene", async function(){

      let r = await request(this.server).patch("/scenes/foo")
      .auth(sceneAdminUser.username, "xxxxxxxx")
      .send({archived: true})
      .expect(200);

      r = await request(this.server).patch("/scenes/"+encodeURIComponent(`foo#${ids[0]}`))
      .auth(sceneAdminUser.username, "xxxxxxxx")
      .send({archived: false})
      .expect(200);

      expect(r.body).to.have.property("archived").to.equal(null);
      expect(r.body).to.have.property("name").to.equal(`foo`);
    });

    it("can restore a scene with an explicit new name", async function(){

      let r = await request(this.server).patch("/scenes/foo")
      .auth(sceneAdminUser.username, "xxxxxxxx")
      .send({archived: true})
      .expect(200);

      r = await request(this.server).patch("/scenes/"+encodeURIComponent(`foo#${ids[0]}`))
      .auth(sceneAdminUser.username, "xxxxxxxx")
      .send({archived: false, name: "some_unique_name"})
      .expect(200);

      expect(r.body).to.have.property("archived").to.equal(null);
      expect(r.body).to.have.property("name").to.equal(`some_unique_name`);
    });

    it("can use \"false\" as false", async function(){
      //Because forms can't really have booleans

      let r = await request(this.server).patch("/scenes/foo")
      .auth(sceneAdminUser.username, "xxxxxxxx")
      .send({archived: true})
      .expect(200);

      r = await request(this.server).patch("/scenes/"+encodeURIComponent(`foo#${ids[0]}`))
      .auth(sceneAdminUser.username, "xxxxxxxx")
      .send({archived: "false"})
      .expect(200);

      expect(r.body).to.have.property("archived").to.equal(null);
      expect(r.body).to.have.property("name").to.equal(`foo`);

    })
  })

  it("can set public access", async function () {
    await request(this.server).patch(`/scenes/foo`)
    .auth(sceneAdminUser.username, "xxxxxxxx")
    .send({public_access: "none"})
    .expect(200);

    let scene = await vfs.getScene("foo");
    expect(scene).to.have.property("public_access", "none");
  
    await request(this.server).patch(`/scenes/foo`)
    .auth(sceneAdminUser.username, "xxxxxxxx")
    .send({public_access: "read"})
    .expect(200);
    
    scene = await vfs.getScene("foo");
    expect(scene).to.have.property("public_access", "read");
  
  })
  describe("set default access", function(){

    this.beforeEach(async function(){
        await request(this.server).patch(`/scenes/foo`)
       .auth(sceneAdminUser.username, "xxxxxxxx")
       .send({default_access: "none", public_access: "none"})
       .expect(200);
    });

    it("can set default access to none", async function () {
      await request(this.server).get("/scenes/foo")
      .auth(user.username, "xxxxxxxx")
      .expect(404);
    })

    it("can set default access to read lkzu_xfdjkryd", async function () {
      await request(this.server).patch(`/scenes/foo`)
      .auth(sceneAdminUser.username, "xxxxxxxx")
      .send({default_access: "read"})
      .expect(200);
      console.log("set to read");

      await request(this.server).get("/scenes/foo")
      .auth(user.username, "xxxxxxxx")
      .expect(200);

      await request(this.server).put("/scenes/foo/articles/foo.html")
      .set("Content-Type", "text/plain")
      .auth(user.username,"xxxxxxxx")
      .expect(401);

      await request(this.server).patch("/scenes/foo")
      .auth(user.username, "xxxxxxxx")
      .send({name: "foofoo"})
      .expect(401);
    })

    it("can set default access to write", async function () {
      await request(this.server).patch(`/scenes/foo`)
      .auth(sceneAdminUser.username, "xxxxxxxx")
      .send({default_access: "write"})
      .expect(200);

      await request(this.server).put("/scenes/foo/articles/foo.html")
      .set("Content-Type", "text/plain")
      .auth(user.username,"xxxxxxxx")
      .expect(201);

      await request(this.server).patch("/scenes/foo")
      .auth(user.username, "xxxxxxxx")
      .send({name: "foofoo"})
      .expect(401);
    })

  })

});

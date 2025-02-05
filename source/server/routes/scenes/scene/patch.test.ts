import request from "supertest";

import { randomBytes } from "crypto";

import User from "../../../auth/User.js";
import Vfs from "../../../vfs/index.js";
import UserManager from "../../../auth/UserManager.js";

describe("PATCH /scenes/:scene", function(){
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

  describe("name", function(){
    it("can rename", async function(){
      await request(this.server).patch("/scenes/foo")
      .set("Content-Type", "application/json")
      .send({name: "foofoo"})
      .expect(200);
    });

    it("forces unique names", async function(){
      await request(this.server).patch("/scenes/foo")
      .set("Content-Type", "application/json")
      .send({name: "bar"})
      .expect(409);
    })

    it("is admin-protected", async function(){
      await userManager.grant("foo", "any", "write");
      await userManager.grant("foo", "default", "write");
      await request(this.server).patch("/scenes/foo")
      .set("Content-Type", "application/json")
      .send({name: "foofoo"})
      .expect(401);
    });

    it("is access-protected (obfuscated as 404)", async function(){
      await userManager.grant("foo", "default", "none");
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
      .expect(200);

      expect(r.body).to.have.property("tags").to.deep.equal(["foo", "bar"]);
    })    
    
    it("trims tag names", async function(){
      let r = await request(this.server).patch("/scenes/foo")
      .send({tags: [" foo"]})
      .expect(200);

      expect(r.body).to.have.property("tags").to.deep.equal(["foo"])

      //Also trim when comparing with existing tags
      r = await request(this.server).patch("/scenes/foo")
      .send({tags: [" foo"]})
      .expect(200);
      expect(r.body, `existing tag should be compared with the trimmed tag name`).to.have.property("tags").to.deep.equal(["foo"])
    });

    it("can submit an empty value", async function(){
      //When using form elements, it's tricky to generate a request like `{tags:["foo"]}`.
      //So we make it `{tags:""}` when empty  or {tags:["foo", ""]}` when one value is set
      //Through the addition of a hidden empty input field
      let r = await request(this.server).patch("/scenes/foo")
      .send({tags: ["foo", ""]})
      .expect(200);

      expect(r.body).to.have.property("tags").to.deep.equal(["foo"]);

      //Unset the tag we just made
      r = await request(this.server).patch("/scenes/foo")
      .send({tags: ""})
      .expect(200);

      expect(r.body).to.have.property("tags").to.deep.equal([]);



      //Set it back with two values
      r = await request(this.server).patch("/scenes/foo")
      .send({tags: ["foo", "bar", ""]})
      .expect(200);

      expect(r.body).to.have.property("tags").to.deep.equal(["foo", "bar"]);

      //An array with only an empty string will probable never get sent but that's still tested
      r = await request(this.server).patch("/scenes/foo")
      .send({tags: [""]})
      .expect(200);

      expect(r.body).to.have.property("tags").to.deep.equal([])
    });

    
  })

  describe("archive", function(){
    it("can archive a scene", async function(){

      let r = await request(this.server).patch("/scenes/foo")
      .send({archived: true})
      .expect(200);

      expect(r.body).to.have.property("archived").to.equal(true);
      expect(r.body).to.have.property("name").to.equal(`foo#${ids[0]}`);
    });

    it("can restore a scene", async function(){

      let r = await request(this.server).patch("/scenes/foo")
      .send({archived: true})
      .expect(200);

      r = await request(this.server).patch("/scenes/"+encodeURIComponent(`foo#${ids[0]}`))
      .send({archived: false})
      .expect(200);

      expect(r.body).to.have.property("archived").to.equal(false);
      expect(r.body).to.have.property("name").to.equal(`foo`);
    });

    it("can restore a scene with an explicit new name", async function(){

      let r = await request(this.server).patch("/scenes/foo")
      .send({archived: true})
      .expect(200);

      r = await request(this.server).patch("/scenes/"+encodeURIComponent(`foo#${ids[0]}`))
      .send({archived: false, name: "some_unique_name"})
      .expect(200);

      expect(r.body).to.have.property("archived").to.equal(false);
      expect(r.body).to.have.property("name").to.equal(`some_unique_name`);
    });

    it("can use \"false\" as false", async function(){
      //Because forms can't really have booleans

      let r = await request(this.server).patch("/scenes/foo")
      .send({archived: true})
      .expect(200);

      r = await request(this.server).patch("/scenes/"+encodeURIComponent(`foo#${ids[0]}`))
      .send({archived: "false"})
      .expect(200);

      expect(r.body).to.have.property("archived").to.equal(false);
      expect(r.body).to.have.property("name").to.equal(`foo`);

    })
  })

});

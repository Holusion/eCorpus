import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from 'url';
import {tmpdir} from "os";
import timers from 'timers/promises';

import request from "supertest";
import { expect } from "chai";

import postScene from "./post.js";
import express, { Application } from "express";
import wrap from "../../../utils/wrapAsync.js";
import Vfs from "../../../vfs/index.js";

import { fixturesDir } from "../../../__test_fixtures/fixtures.js";
import UserManager from "../../../auth/UserManager.js";
import User, { UserLevels } from "../../../auth/User.js";


const models = (await fs.readdir(fixturesDir)).filter(f=> f.endsWith("glb")).map(f=>path.join(fixturesDir, f));

describe("POST /scenes/:scene", function(){
  let vfs:Vfs, userManager: UserManager, user :User, app: Application, data:Buffer;
  this.beforeEach(async function(){
    const locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager = locals.userManager;
    app = this.server;
    data = await fs.readFile(path.join(fixturesDir, "cube.glb"));
  });
  this.afterEach(async function(){
    await cleanIntegrationContext(this);
  });

  describe("as create", function () {
    this.beforeEach(async function () {
      user = await userManager.addUser("celia", "12345678", "create", "create@example.com");
    });

    it("creates .glb and .svx.json files", async function () {
      await request(app).post("/scenes/foo")
        .auth(user.username, "12345678")
        .send(data)
        .expect(201);
      await expect(vfs.getScenes()).to.eventually.have.property("length", 1);

      //Check scene.svx.json in the databse - because GET gets special-cased and can lie about the stored mime type
      const docProps = await vfs.getFileProps({scene: "foo", name:"scene.svx.json"}, true);
      expect(docProps).to.have.property("mime", "application/si-dpo-3d.document+json");
      // Check GET scene.svx.json
      let res = await request(app).get("/scenes/foo/scene.svx.json")
        .auth(user.username, "12345678")
        .expect(200)
        .expect("Content-Type", "application/si-dpo-3d.document+json");
      let doc = res.body;
      let models = doc.models.map((m:any)=> m.derivatives.map((d:any)=>d.assets.map((a:any)=>a.uri))).flat(3);

      expect(models).to.have.property("length").not.equal(0);
      for(let model of models){
        await request(app).get("/scenes/foo/"+model)
        .auth(user.username, "12345678")
        .expect(200)
        .expect("Content-Type", "model/gltf-binary");
      }
    });

    it("can upload the model as-is", async function(){
      await request(app).post("/scenes/foo?optimize=false")
      .auth(user.username, "12345678")
      .send(data)
      .expect(201);
      let res = await request(app).get("/scenes/foo/scene.svx.json")
        .auth(user.username, "12345678")
        .expect(200)
        .expect("Content-Type", "application/si-dpo-3d.document+json");
      let doc = res.body;
      let high_model = doc.models.map((m:any)=> m.derivatives.filter((d: any)=>d.quality == "High").map((d:any)=>d.assets.map((a:any)=>a.uri))).flat(3)[0];

      expect(high_model, "Expected to find a model of quality \"High\"").to.be.ok;
          res = await request(app).get(`/scenes/foo/${high_model}`)
      .auth(user.username, "12345678")
      .expect(200);

      expect(res.text, `expect model to not have been modified during the upload`).to.equal(data.toString("utf8"));
    });

    models.forEach(model=>{
      [true, false].forEach(optimize=>{
        it(`can upload ${path.basename(model)} with${optimize?"":"out"} optimization`, async function(){
          const data = await fs.readFile(model);

          await request(app).post(`/scenes/foo?optimize=${optimize.toString()}`)
          .auth(user.username, "12345678")
          .send(data)
          .expect(201);

          let res = await request(app).get("/scenes/foo/scene.svx.json")
          .auth(user.username, "12345678")
          .expect(200)
          .expect("Content-Type", "application/si-dpo-3d.document+json");
          let doc = res.body;
          let assets = doc.models.map((m:any)=> m.derivatives.map((d:any)=>d.assets.map((a:any)=>a.uri))).flat(3);
          expect(assets).to.have.property("length", optimize? 2 : 1);
          
          let high_model = doc.models.map((m:any)=> m.derivatives.filter((d: any)=>d.quality == "High").map((d:any)=>d.assets.map((a:any)=>a.uri))).flat(3)[0];
          expect(high_model, "Expected to find a model of quality \"High\"").to.be.ok;
          res = await request(app).get(`/scenes/foo/${high_model}`)
          .auth(user.username, "12345678")
          .expect(200);

          if(optimize){
            expect(res.text, `expect model to have been modified during the upload`).to.not.equal(data.toString("utf8"));
          }else{
            expect(res.text, `expect model to not have been modified during the upload`).to.equal(data.toString("utf8"));
          }
          
        });
      })
    })

    it("can force scene's setup language", async function () {
      await request(app).post("/scenes/foo?language=fr")
        .auth(user.username, "12345678")
        .send(data)
        .expect(201);

      await expect(vfs.getScenes()).to.eventually.have.property("length", 1);
      let { body: document } = await request(app).get("/scenes/foo/scene.svx.json")
        .auth(user.username, "12345678")
        .expect(200)
        .expect("Content-Type", "application/si-dpo-3d.document+json");
      expect(document.setups[0]).to.have.deep.property("language", { language: "FR" });
    })

    it.skip("has a soft lock over the scene file", async function () {
      //This test has a race condition that is hard to fix.
      this.retries(2);
      //Tries to do two concurrent requests over the same file
      const r1 = request(app).post("/scenes/foo")
        .auth(user.username, "12345678")
        .send(data);
      await timers.setImmediate();
      const r2 = request(app).post("/scenes/foo")
        .send(data);

      await Promise.all([
        r1.expect(201),
        r2.then(res => expect(res.text).to.match(/A scene named foo already exists/))
      ]);
    });

    it("rejects bad files", async function () {
      let res = await request(app).post("/scenes/foo")
      .auth(user.username, "12345678")
      .set("Content-Type", "application/zip")
      .send("foo");
      expect(res.status, `${res.error}`).to.equal(500);
      //Code 500 to differentiate bad data from bad encoding (see following tests)
      //If return code is ever changed to 400, we need to specify those tests further.
      expect(await vfs.getScenes(null, {archived: false})).to.have.property("length", 0);
      //Scene is still there, but archived
      expect(await vfs.getScenes()).to.have.property("length", 1);
    });

    it("rejects multipart form-data", async function () {
      await request(app).post("/scenes/foo")
        .auth(user.username, "12345678")
        .set("Content-Type", "multipart/form-data")
        .send(data) //Don't care
        .expect(400);
    })

    it("rejects urlencoded form-data", async function () {
      await request(app).post("/scenes/foo")
        .auth(user.username, "12345678")
        .set("Content-Type", "application/x-www-form-urlencoded")
        .send(data) //Don't care
        .expect(400);
    });

    it("requires authentication", async function () {
      await request(app).post("/scenes/foo")
        //no authentication
        .send(data)
        .expect(401);
    });

    it("can't overwrite an existing scene", async function () {
      //Create the scene as "bob"
      await request(app).post("/scenes/foo")
        .auth(user.username, "12345678")
        .send(data)
        .expect(201);

      await request(app).post("/scenes/foo")
        .auth(user.username, "12345678")
        .send(data)
        .expect(409);
    });
  });

  describe("as use", function () {
    this.beforeEach(async function () {
      user = await userManager.addUser("ulysse", "12345678", "use", "ulysse@example.com");
    });

    it("cannot create scene ", async function () {
        await request(app).post("/scenes/foo")
        .auth(user.username, "12345678")
        .send(data)
        .expect(401);
    });
  });
});
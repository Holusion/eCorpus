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


describe("POST /scenes/:scene", function(){
  let vfs:Vfs, userManager: UserManager, user :User, app: Application, data:Buffer;
  this.beforeEach(async function(){
    const locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager = locals.userManager;
    app = this.server;
    data = await fs.readFile(path.join(fixturesDir, "cube.glb"));

    user = await userManager.addUser("bob", "12345678", "admin", "bob@example.com");
  });
  this.afterEach(async function(){
    await vfs.close();
    await fs.rm(this.dir, {recursive: true});
  });

  it("creates .glb and .svx.json files", async function(){
    await request(app).post("/scenes/foo")
    .auth(user.username, "12345678")
    .send(data)
    .expect(201);
    await expect(vfs.getScenes()).to.eventually.have.property("length", 1);


    await request(app).get("/scenes/foo/models/foo.glb")
    .auth(user.username, "12345678")
    .expect(200)
    .expect("Content-Type", "model/gltf-binary");

    await request(app).get("/scenes/foo/scene.svx.json")
    .auth(user.username, "12345678")
    .expect(200)
    .expect("Content-Type", "application/si-dpo-3d.document+json");
  });

  it("can force scene's setup language", async function(){
    await request(app).post("/scenes/foo?language=fr")
    .auth(user.username, "12345678")
    .send(data)
    .expect(201);

    await expect(vfs.getScenes()).to.eventually.have.property("length", 1);
    let {body:document} = await request(app).get("/scenes/foo/scene.svx.json")
    .auth(user.username, "12345678")
    .expect(200)
    .expect("Content-Type", "application/si-dpo-3d.document+json");
    expect(document.setups[0]).to.have.deep.property("language", {language: "FR"});
  })

  it.skip("has a soft lock over the scene file", async function(){
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
      r2.then(res=> expect(res.text).to.match(/A scene named foo already exists/))
    ]);
  });

  it("rejects bad files", async function(){
    let res = await request(app).post("/scenes/foo")
    .auth(user.username, "12345678")
    .set("Content-Type", "application/zip")
    .send("foo");
    expect(res.status, `${res.error}`).to.equal(500);
    //Code 500 to differentiate bad data from bad encoding (see following tests)
    //If return code is ever changed to 400, we need to specify those tests further.
    expect( await vfs.getScenes()).to.have.property("length", 0);
    expect(await vfs._db.get(`SELECT COUNT(*) AS count FROM files`)).to.have.property("count", 0);
  })

  it("rejects multipart form-data", async function(){
    await request(app).post("/scenes/foo")
    .auth(user.username, "12345678")
    .set("Content-Type", "multipart/form-data")
    .send(data) //Don't care
    .expect(400);
  })

  it("rejects urlencoded form-data", async function(){
    await request(app).post("/scenes/foo")
    .auth(user.username, "12345678")
    .set("Content-Type", "application/x-www-form-urlencoded")
    .send(data) //Don't care
    .expect(400);
  });

  it("requires authentication", async function(){
    await request(app).post("/scenes/foo")
    //no authentication
    .send(data)
    .expect(401);
  });

  it("can't overwrite an existing scene", async function(){
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
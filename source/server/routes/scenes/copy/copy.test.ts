import fs from "fs/promises";
import path from "path";
import {tmpdir} from "os";

import request from "supertest";
import { expect } from "chai";

import express, { Application } from "express";
import User from "../../../auth/User.js";
import UserManager from "../../../auth/UserManager.js";
import Vfs, { WriteFileParams } from "../../../vfs/index.js";
import { Element, xml2js } from "xml-js";



describe("COPY /scenes/:name", function(){
  let vfs :Vfs, userManager :UserManager, user :User, admin :User, scene_id :number;
  this.beforeEach(async function(){
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager = locals.userManager;
    user = await userManager.addUser("bob", "12345678");
    admin = await userManager.addUser("alice", "12345678", true);

    scene_id = await vfs.createScene("foo", user.uid);
    await vfs.writeDoc("{}", scene_id, user.uid);
    await vfs.writeFile(dataStream(), {scene: "foo", mime:"model/gltf-binary", name: "models/foo.glb", user_id: user.uid});


    this.agent = request.agent(this.server);
    await this.agent.post("/api/v1/login")
    .send({username: user.username, password: "12345678"})
    .set("Content-Type", "application/json")
    .set("Accept", "")
    .expect(200);
  });
  this.afterEach(async function(){
    await cleanIntegrationContext(this);
  });

  it("can COPY a file", async function(){
    let props :WriteFileParams = {user_id: 0, scene: "foo", mime: "text/html", name:"articles/hello-world.html"};
    await vfs.writeFile(dataStream(), props);
    await this.agent.copy("/scenes/foo/articles/hello-world.html")
    .set("Destination", "http://localhost:8000/scenes/foo/articles/goodbye-world.html")
    .expect(201);
    await expect(vfs.getFileProps({...props, name: "articles/hello-world.html"}), "old file should still be here").to.be.fulfilled;
    await expect(vfs.getFileProps({...props, name: "articles/goodbye-world.html"}), "new file should have been  created").to.be.fulfilled;
  });

  it("can COPY with a label to restore a file version", async function(){
    let props :WriteFileParams = {user_id: user.uid, scene: "foo", mime: "text/html", name:"articles/hello-world.html"};
    let {ctime:t1, mtime:_, id:id1, generation:g1, ...f1} = await vfs.writeFile(dataStream(), props);
    let t2 = new Date(t1.valueOf()+10000);
    let f2 = await vfs.writeFile(dataStream(["goodbye world\n"]), props);

    await vfs._db.run(`UPDATE files SET ctime = datetime("${t2.toISOString()}") WHERE file_id = $id`, {$id: f2.id})

    await this.agent.copy("/scenes/foo/articles/hello-world.html")
    .set("Destination", "http://localhost:8000/scenes/foo/articles/hello-world.html")
    .set("Label", f1.hash)
    .expect(201);

    let {ctime, mtime, id:id2, generation:g2, ...new_file} = await expect(vfs.getFileProps({...props, name: "articles/hello-world.html"}), "file should still be here").to.be.fulfilled;
    expect(id2).not.to.equal(id1);
    expect(g2).to.equal(3);
    //Check times
    expect(ctime.valueOf()).to.equal(t1.valueOf());
    expect(new_file).to.deep.equal(f1);
  });

  it("can COPY a document", async function(){
    let {id:scene_id} = await vfs.getScene("foo");
    await vfs.writeDoc('{"id":2}', "foo", user.uid);
    let {ctime:t1, id, generation, ...src} = await vfs.getDoc(scene_id);
    //Round mtime down, otherwise sqlite's conversion might round to another second.
    src.mtime.setMilliseconds(0);
    await vfs._db.run(`UPDATE files SET ctime = datetime("${src.mtime.toISOString()}") WHERE file_id = $id`, {$id: id})

    await vfs.writeDoc('{"id":3}', "foo", user.uid);

    await this.agent.copy("/scenes/foo/scene.svx.json")
    .set("Destination", "http://localhost:8000/scenes/foo/scene.svx.json")
    .set("Label", generation)
    .expect(201);
    let {ctime:t2, id:id2, generation:g2, ...new_doc} = await expect(vfs.getDoc(scene_id), "file should still be here").to.be.fulfilled;
    expect(id2).not.to.equal(id);
    expect(g2).to.equal(4);
    expect(new_doc).to.deep.equal(src);
  });

  it("can't COPY a document to another scene", async function(){
    await this.agent.copy("/scenes/foo/scene.svx.json")
    .set("Destination", "http://localhost:8000/scenes/bar/scene.svx.json")
    .expect(400);
  });
});

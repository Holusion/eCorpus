import request from "supertest";
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

import UserManager from "../../../auth/UserManager.js";
import User from "../../../auth/User.js";
import Vfs from "../../../vfs/index.js";
import { TaskScheduler } from "../../../tasks/scheduler.js";
import { fixturesDir } from "../../../__test_fixtures/fixtures.js";
import { derivativeName } from "../../../tasks/handlers/uploads.js";


describe("PUT /uploads/:id/derivatives/:usage/:quality", function(){
  let vfs :Vfs, userManager :UserManager, taskScheduler :TaskScheduler;
  let bob :User, charlie :User;
  let scene: string, scene_id: number;
  let cube: Buffer;

  this.beforeAll(async function(){
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager = locals.userManager;
    taskScheduler = locals.taskScheduler;
    bob = await userManager.addUser("bob", "12345678", "create");
    charlie = await userManager.addUser("charlie", "12345678", "create");
    cube = await fs.readFile(path.join(fixturesDir, "cube.glb"));
  });

  this.beforeEach(async function(){
    scene = randomBytes(4).toString("hex");
    scene_id = await vfs.createScene(scene, bob.uid);
  });

  /** Names of the files in the test's scene */
  async function sceneFiles(): Promise<string[]>{
    const names: string[] = [];
    for await (const f of vfs.listFiles(scene_id)) names.push(f.name);
    return names.sort();
  }

  /** Create an upload as `username` and send its data in one go. Returns the upload's id */
  async function upload(ctx: Mocha.Context, {filename = "cube.glb", data = cube, username = "bob", target = scene as string|null} = {}): Promise<number>{
    const {body: {task_id}} = await request(ctx.server).post("/uploads")
    .set("Authorization", await bearer(username))
    .send({filename, size: data.length, scene: target})
    .expect(201);
    await request(ctx.server).put(`/uploads/${task_id}`)
    .set("Authorization", await bearer(username))
    .send(data)
    .expect(201);
    return task_id;
  }

  it("makes a derivative into the upload's scene", async function(){
    const id = await upload(this);
    const res = await request(this.server).put(`/uploads/${id}/derivatives/Web3D/High`)
    .set("Authorization", await bearer("bob"))
    .expect(201);
    expect(res.headers).to.have.property("location", `/scenes/${scene}/cube-high.glb`);
    expect(res.headers).to.have.property("content-location", `/tasks/${res.body.task_id}`);
    expect(res.body).to.have.property("type", "createUploadDerivative");
    expect(res.body).to.have.property("status", "success");
    expect(res.body).to.have.property("scene_id", scene_id);
    expect(res.body.output).to.include({uri: "cube-high.glb", usage: "Web3D", quality: "High", mime: "model/gltf-binary"});
    expect(res.body.output).to.have.property("numFaces").a("number").above(0);
    expect(res.body.output).to.have.property("byteSize").a("number").above(0);
    expect(res.body.output).to.have.property("bounds").an("object");

    const file = await vfs.getFileProps({scene, name: "cube-high.glb"});
    expect(file).to.have.property("mime", "model/gltf-binary");
    expect(file).to.have.property("size", res.body.output.byteSize);
    //Can be fetched where it says it is
    await request(this.server).get(res.headers.location)
    .set("Authorization", await bearer("bob"))
    .expect(200)
    .expect("Content-Type", "model/gltf-binary");
  });

  it("makes several derivatives from one upload", async function(){
    const id = await upload(this);
    for(const quality of ["High", "Low"]){
      await request(this.server).put(`/uploads/${id}/derivatives/Web3D/${quality}`)
      .set("Authorization", await bearer("bob"))
      .expect(201);
    }
    expect(await sceneFiles()).to.deep.equal(["cube-high.glb", "cube-low.glb"]);
  });

  it("writes a new version of the same file when made again", async function(){
    const id = await upload(this);
    for(let i = 0; i < 2; i++){
      await request(this.server).put(`/uploads/${id}/derivatives/Web3D/High`)
      .set("Authorization", await bearer("bob"))
      .expect(201);
    }
    const file = await vfs.getFileProps({scene, name: "cube-high.glb"});
    expect(file).to.have.property("generation", 2);
  });

  it("converts other model formats", async function(){
    //obj2gltf runs with `secure: true`: the .mtl isn't needed to convert the geometry
    const obj = await fs.readFile(path.join(fixturesDir, "cube.obj"));
    const id = await upload(this, {filename: "cube.obj", data: obj});
    const res = await request(this.server).put(`/uploads/${id}/derivatives/Web3D/Medium`)
    .set("Authorization", await bearer("bob"))
    .expect(201);
    expect(res.body.output).to.include({uri: "cube-medium.glb", mime: "model/gltf-binary"});
    expect(await vfs.getFileProps({scene, name: "cube-medium.glb"})).to.have.property("mime", "model/gltf-binary");
  });

  describe("rejects", function(){
    it("an unsupported usage", async function(){
      const id = await upload(this);
      await request(this.server).put(`/uploads/${id}/derivatives/App3D/High`)
      .set("Authorization", await bearer("bob"))
      .expect(400);
    });

    it("an unknown quality", async function(){
      const id = await upload(this);
      await request(this.server).put(`/uploads/${id}/derivatives/Web3D/Ultra`)
      .set("Authorization", await bearer("bob"))
      .expect(400);
    });

    it("an upload that hasn't received its data", async function(){
      const {body: {task_id}} = await request(this.server).post("/uploads")
      .set("Authorization", await bearer("bob"))
      .send({filename: "cube.glb", size: cube.length, scene})
      .expect(201);
      await request(this.server).put(`/uploads/${task_id}/derivatives/Web3D/High`)
      .set("Authorization", await bearer("bob"))
      .expect(409);
    });

    it("an upload without a scene", async function(){
      const id = await upload(this, {target: null});
      await request(this.server).put(`/uploads/${id}/derivatives/Web3D/High`)
      .set("Authorization", await bearer("bob"))
      .expect(400);
    });

    it("an upload that is not a model", async function(){
      const id = await upload(this, {filename: "notes.txt", data: Buffer.from("Hello")});
      const res = await request(this.server).put(`/uploads/${id}/derivatives/Web3D/High`)
      .set("Authorization", await bearer("bob"))
      .set("Accept-Language", "fr")
      .expect(400);
      expect(res.body).to.have.property("message", "Error: notes.txt n'est pas un modèle 3D");
    });

    it("a task that is not an upload", async function(){
      const task = await taskScheduler.create({scene_id, user_id: bob.uid, type: "delayTask", data: {}});
      await request(this.server).put(`/uploads/${task.task_id}/derivatives/Web3D/High`)
      .set("Authorization", await bearer("bob"))
      .expect(404);
    });

    it("someone else's upload", async function(){
      const id = await upload(this);
      //Even with write access to the scene
      await userManager.grant(scene, charlie.username, "write");
      await request(this.server).put(`/uploads/${id}/derivatives/Web3D/High`)
      .set("Authorization", await bearer("charlie"))
      .expect(401);
      expect(await sceneFiles()).to.deep.equal([]);
    });

    it("an upload whose scene is no longer writable", async function(){
      await userManager.grant(scene, charlie.username, "write");
      const id = await upload(this, {username: "charlie"});
      await userManager.grant(scene, charlie.username, "read");
      await request(this.server).put(`/uploads/${id}/derivatives/Web3D/High`)
      .set("Authorization", await bearer("charlie"))
      .expect(401);
      expect(await sceneFiles()).to.deep.equal([]);
    });
  });
});

describe("derivativeName()", function(){
  for(const [filename, quality, expected] of [
    ["cube.glb", "High", "cube-high.glb"],
    ["cube.obj", "Low", "cube-low.glb"],
    ["my model.tar.glb", "Medium", "my model.tar-medium.glb"],
    ["dir/cube.glb", "Thumb", "cube-thumb.glb"],
    ["noext", "AR", "noext-ar.glb"],
    [".glb", "High", "model-high.glb"],
  ] as const){
    it(`${filename} (${quality}) → ${expected}`, function(){
      expect(derivativeName(filename, quality)).to.equal(expected);
    });
  }
});

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
import { sendUpload } from "../../../__test_fixtures/uploads.js";
import { glbToGltf } from "../../../__test_fixtures/gltf.js";


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

  /** Create an upload of one file as `username`, send its data and process it. Returns the upload's id */
  async function upload(ctx: Mocha.Context, {filename = "cube.glb", data = cube, username = "bob", target = scene as string|null} = {}): Promise<number>{
    const {task_id, res} = await sendUpload(ctx.server, await bearer(username), {files: {[filename]: data}, scene: target});
    expect(res.status, res.text).to.equal(200);
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
    const obj = Buffer.from((await fs.readFile(path.join(fixturesDir, "cube.obj"), "utf-8")).replace(/^mtllib .*$/m, ""));
    const id = await upload(this, {filename: "cube.obj", data: obj});
    const res = await request(this.server).put(`/uploads/${id}/derivatives/Web3D/Medium`)
    .set("Authorization", await bearer("bob"))
    .expect(201);
    expect(res.body.output).to.include({uri: "cube-medium.glb", mime: "model/gltf-binary"});
    expect(await vfs.getFileProps({scene, name: "cube-medium.glb"})).to.have.property("mime", "model/gltf-binary");
  });

  it("converts a model with the files it refers to, in their folders", async function(){
    const mtl = Buffer.concat([await fs.readFile(path.join(fixturesDir, "cube.mtl")), Buffer.from("map_Kd tex/diffuse.png\n")]);
    //1x1 PNG
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    const {task_id: id, res: processed} = await sendUpload(this.server, await bearer("bob"), {
      scene,
      main: "model/cube.obj",
      files: {
        "model/cube.obj": await fs.readFile(path.join(fixturesDir, "cube.obj")),
        "model/cube.mtl": mtl,
        "model/tex/diffuse.png": png,
      },
    });
    expect(processed.status, processed.text).to.equal(200);
    const res = await request(this.server).put(`/uploads/${id}/derivatives/Web3D/High`)
    .set("Authorization", await bearer("bob"))
    .expect(201);
    expect(res.body.output).to.include({uri: "cube-high.glb", mime: "model/gltf-binary"});
    //The texture was found where the .mtl says it is
    expect(res.body.output).to.have.property("imageSize").above(0);
  });

  it("converts PLY models", async function(){
    const ply = Buffer.from([
      "ply", "format ascii 1.0",
      "element vertex 3", "property float x", "property float y", "property float z",
      "element face 1", "property list uchar int vertex_indices",
      "end_header",
      "0 0 0", "1 0 0", "0 1 0",
      "3 0 1 2", "",
    ].join("\n"));
    const id = await upload(this, {filename: "triangle.ply", data: ply});
    const res = await request(this.server).put(`/uploads/${id}/derivatives/Web3D/High`)
    .set("Authorization", await bearer("bob"))
    .expect(201);
    expect(res.body.output).to.include({uri: "triangle-high.glb", numFaces: 1});
  });

  it("tells which file a model is missing", async function(){
    //The .mtl is not sent
    const id = await upload(this, {filename: "cube.obj", data: await fs.readFile(path.join(fixturesDir, "cube.obj"))});
    const res = await request(this.server).put(`/uploads/${id}/derivatives/Web3D/High`)
    .set("Authorization", await bearer("bob"))
    .set("Accept-Language", "fr")
    .expect(400);
    expect(res.body).to.have.property("message").match(/^Error: cube\.obj n'a pas pu être converti en modèle 3D : .*cube\.mtl/);
    expect(await sceneFiles()).to.deep.equal([]);
  });

  it("packs a glTF with the files it refers to", async function(){
    const {json, files: resources} = await glbToGltf(path.join(fixturesDir, "cube_textured.glb"));
    const files: Record<string, Buffer> = {"model/cube.gltf": Buffer.from(JSON.stringify(json))};
    for(const [rel, data] of Object.entries(resources)){
      files[`model/${rel}`] = data;
    }
    expect(Object.keys(files)).to.have.length.above(1);
    const {task_id: id, res: processed} = await sendUpload(this.server, await bearer("bob"), {scene, main: "model/cube.gltf", files});
    expect(processed.status, processed.text).to.equal(200);
    const res = await request(this.server).put(`/uploads/${id}/derivatives/Web3D/High`)
    .set("Authorization", await bearer("bob"))
    .expect(201);
    expect(res.body.output).to.include({uri: "cube-high.glb", mime: "model/gltf-binary"});
    expect(res.body.output).to.have.property("imageSize").above(0);
  });

  it("refuses a glTF that misses a texture, whatever its use", async function(){
    const {json, files: resources} = await glbToGltf(path.join(fixturesDir, "cube_textured.glb"));
    json.images.push({uri: "normal.png"});
    json.textures.push({source: 1});
    json.materials[0].normalTexture = {index: 1};
    const files: Record<string, Buffer> = {"cube.gltf": Buffer.from(JSON.stringify(json)), ...resources};
    const {task_id: id, res: processed} = await sendUpload(this.server, await bearer("bob"), {scene, main: "cube.gltf", files});
    expect(processed.status, processed.text).to.equal(200);
    const res = await request(this.server).put(`/uploads/${id}/derivatives/Web3D/High`)
    .set("Authorization", await bearer("bob"))
    .expect(400);
    expect(res.body).to.have.property("message", "Error: cube.gltf could not be converted to a 3D model: image 'normal.png': not found, or outside the model's folder");
    expect(await sceneFiles()).to.deep.equal([]);
  });

  for(const uri of ["../secret.bin", "%2E%2E/secret.bin", "/etc/hostname", "file:///etc/hostname", "https://example.com/cube.bin"]){
    it(`refuses a glTF that refers outside of its folder: ${uri}`, async function(){
      const {json} = await glbToGltf(path.join(fixturesDir, "cube.glb"));
      json.buffers[0].uri = uri;
      const id = await upload(this, {filename: "model/cube.gltf", data: Buffer.from(JSON.stringify(json))});
      const res = await request(this.server).put(`/uploads/${id}/derivatives/Web3D/High`)
      .set("Authorization", await bearer("bob"))
      .expect(400);
      expect(res.body).to.have.property("message").match(/outside the model's folder/);
      expect(await sceneFiles()).to.deep.equal([]);
    });
  }

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

    it("an upload that hasn't been processed", async function(){
      const {body: {task_id}} = await request(this.server).post("/uploads")
      .set("Authorization", await bearer("bob"))
      .send({scene})
      .expect(201);
      await request(this.server).put(`/uploads/${task_id}/files/cube.glb`)
      .set("Authorization", await bearer("bob"))
      .send(cube)
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

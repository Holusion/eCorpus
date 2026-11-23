import request from "supertest";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";

import UserManager from "../../../auth/UserManager.js";
import User from "../../../auth/User.js";
import Vfs from "../../../vfs/index.js";
import { fixturesDir } from "../../../__test_fixtures/fixtures.js";
import { sendUpload } from "../../../__test_fixtures/uploads.js";


describe("POST /uploads/:id/derivatives", function(){
  let vfs :Vfs, userManager :UserManager;
  let bob :User;
  let scene: string, scene_id: number;
  let cube: Buffer;

  this.beforeAll(async function(){
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager = locals.userManager;
    bob = await userManager.addUser("bob", "12345678", "create");
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

  /** Whether a scene file is the uploaded cube, byte for byte */
  async function isCube(name: string){
    const file = await vfs.getFileProps({scene, name});
    return file.hash === createHash("sha256").update(cube).digest("base64url");
  }

  /** Create an upload of one file as bob, send its data and process it. Returns the upload's id */
  async function upload(ctx: Mocha.Context, {filename = "cube.glb", data = cube} = {}): Promise<number>{
    const {task_id, res} = await sendUpload(ctx.server, await bearer("bob"), {files: {[filename]: data}, scene});
    expect(res.status, res.text).to.equal(200);
    return task_id;
  }

  function post(ctx: Mocha.Context, id: number, body: any){
    return bearer("bob").then(auth => request(ctx.server).post(`/uploads/${id}/derivatives`)
    .set("Authorization", auth)
    .send(body));
  }

  it("makes each quality into the upload's scene, from lowest to highest", async function(){
    const id = await upload(this);
    const res = await post(this, id, {qualities: ["High", "Thumb"]});
    expect(res.status, res.text).to.equal(201);
    expect(res.headers).to.have.property("content-location", `/tasks/${res.body.task_id}`);
    expect(res.body).to.have.property("type", "createUploadDerivatives");
    expect(res.body).to.have.property("status", "success");
    const {derivatives} = res.body.output;
    expect(derivatives.map((d: any)=>[d.usage, d.quality, d.uri])).to.deep.equal([
      ["Web3D", "Thumb", "cube-thumb.glb"],
      ["Web3D", "High", "cube-high.glb"],
    ]);
    expect(await sceneFiles()).to.deep.equal(["cube-high.glb", "cube-thumb.glb"]);
    for(const d of derivatives){
      expect(d).to.have.property("mime", "model/gltf-binary");
      expect(d).to.have.property("numFaces").above(0);
      const file = await vfs.getFileProps({scene, name: d.uri});
      expect(file, d.uri).to.have.property("size", d.byteSize);
    }
  });

  it("optimizes every quality by default", async function(){
    const id = await upload(this);
    const res = await post(this, id, {qualities: ["High"]});
    expect(res.status, res.text).to.equal(201);
    expect(await isCube("cube-high.glb")).to.be.false;
  });

  it("uses the model as it was uploaded for the highest quality, if it's not to be optimized", async function(){
    const id = await upload(this);
    const res = await post(this, id, {qualities: ["Thumb", "Medium"], optimize: false});
    expect(res.status, res.text).to.equal(201);
    expect(await isCube("cube-medium.glb")).to.be.true;
    //The others still are
    expect(await isCube("cube-thumb.glb")).to.be.false;
  });

  it("can take a model that's ready as a lone Thumb", async function(){
    const id = await upload(this);
    const res = await post(this, id, {qualities: ["Thumb"], optimize: false});
    expect(res.status, res.text).to.equal(201);
    expect(res.body.output.derivatives.map((d: any)=>d.uri)).to.deep.equal(["cube-thumb.glb"]);
    expect(await isCube("cube-thumb.glb")).to.be.true;
  });

  it("converts other model formats", async function(){
    const obj = Buffer.from((await fs.readFile(path.join(fixturesDir, "cube.obj"), "utf-8")).replace(/^mtllib .*$/m, ""));
    const id = await upload(this, {filename: "cube.obj", data: obj});
    const res = await post(this, id, {qualities: ["Thumb", "High"], optimize: false});
    expect(res.status, res.text).to.equal(201);
    expect(res.body.output.derivatives.map((d: any)=>[d.uri, d.numFaces])).to.deep.equal([
      ["cube-thumb.glb", 12],
      ["cube-high.glb", 12],
    ]);
  });

  describe("refuses", function(){
    for(const [what, body] of [
      ["no qualities", {}],
      ["an empty list of qualities", {qualities: []}],
      ["an unknown quality", {qualities: ["Thumb", "Huge"]}],
      ["an unknown usage", {usage: "Print3D", qualities: ["High"]}],
      ["an optimize that's not a boolean", {qualities: ["High"], optimize: "no"}],
    ] as const){
      it(what, async function(){
        const id = await upload(this);
        const res = await post(this, id, body);
        expect(res.status, res.text).to.equal(400);
        expect(await sceneFiles()).to.deep.equal([]);
      });
    }

    it("an upload that hasn't been processed", async function(){
      const {body: {task_id}} = await request(this.server).post("/uploads")
      .set("Authorization", await bearer("bob"))
      .send({scene})
      .expect(201);
      const res = await post(this, task_id, {qualities: ["High"]});
      expect(res.status, res.text).to.equal(409);
    });
  });
});

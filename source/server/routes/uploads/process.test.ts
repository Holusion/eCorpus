import request from "supertest";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import UserManager from "../../auth/UserManager.js";
import { TaskScheduler } from "../../tasks/scheduler.js";
import { fixturesDir } from "../../__test_fixtures/fixtures.js";
import { sendUpload } from "../../__test_fixtures/uploads.js";


describe("POST /uploads/:id/process", function(){
  let userManager :UserManager, taskScheduler :TaskScheduler;
  let task: number;

  this.beforeAll(async function(){
    let locals = await createIntegrationContext(this);
    userManager = locals.userManager;
    taskScheduler = locals.taskScheduler;
    await userManager.addUser("alice", "12345678", "admin");
    await userManager.addUser("bob", "12345678");
  });

  this.beforeEach(async function(){
    const {body} = await request(this.server).post("/uploads")
    .set("Authorization", await bearer("alice"))
    .send({})
    .expect(201);
    task = body.task_id;
  });

  /** Send a complete file to the test's upload */
  async function put(ctx: Mocha.Context, filepath: string, data: Buffer = randomBytes(16)){
    await request(ctx.server).put(`/uploads/${task}/files/${filepath}`)
    .set("Authorization", await bearer("alice"))
    .send(data)
    .expect(201);
  }

  function process(ctx: Mocha.Context, body: any){
    return request(ctx.server).post(`/uploads/${task}/process`)
    .set("Authorization", ctx.authorization)
    .send(body);
  }

  this.beforeEach(async function(){
    this.authorization = await bearer("alice");
  });

  it("parses the upload's main file", async function(){
    await put(this, "foo.bin");
    const res = await process(this, {main: "foo.bin"}).expect(200);
    expect(res.headers).to.have.property("content-location", `/tasks/${task}`);
    expect(res.body).to.have.property("status", "success");
    expect(res.body).to.have.property("data").deep.equal({main: "foo.bin"});
    expect(res.body).to.have.property("output").deep.equal({
      fileLocation: `artifacts/${task}/files/foo.bin`,
      isModel: false,
      mime: "application/octet-stream",
    });
    //The processed upload is the response body: no need to fetch it again
    const {body} = await request(this.server).get(`/tasks/${task}`)
    .set("Authorization", this.authorization)
    .expect(200);
    expect(body.task).to.deep.equal(res.body);
  });

  it("parses a main file in a folder, among other files", async function(){
    await put(this, "model/cube.glb", await fs.readFile(path.join(fixturesDir, "cube.glb")));
    await put(this, "model/notes.txt");
    await put(this, "other.bin");
    const res = await process(this, {main: "model/cube.glb"}).expect(200);
    expect(res.body).to.have.nested.property("output.mime", "model/gltf-binary");
    expect(res.body).to.have.nested.property("output.fileLocation", `artifacts/${task}/files/model/cube.glb`);
  });

  it("normalizes the main file's path", async function(){
    await put(this, "model/foo.bin");
    const res = await process(this, {main: "./model/../model/foo.bin"}).expect(200);
    expect(res.body).to.have.property("data").deep.equal({main: "model/foo.bin"});
  });

  it("forwards glTF inspection warnings", async function(){
    await put(this, "textured.glb", await fs.readFile(path.join(fixturesDir, "cube_textured.glb")));
    await process(this, {main: "textured.glb"}).expect(200);
    const { body } = await request(this.server).get(`/tasks/${task}`)
      .set("Authorization", this.authorization)
      .set("Accept-Language", "fr")
      .expect(200);
    expect(body.task.status).to.equal("success");
    expect(body.task.output.mime).to.equal("model/gltf-binary");
    expect(body.task).not.to.have.property("warnings");
    expect(body.task.output.warnings).to.deep.equal([
      { key: "modelWarnings.png-images", params: {}, message: "Cet objet contient des images PNG" },
    ]);
    expect(body.task.output.messages).to.deep.equal([
      { key: "modelWarnings.recommend-optimize", params: {}, message: "Laissez la case « Optimiser » cochée pour créer la scène." },
    ]);
    const { body: tree } = await request(this.server).get(`/tasks/${task}/tree`)
      .set("Authorization", this.authorization)
      .set("Accept-Language", "fr")
      .expect(200);
    const inspect = tree.task.children[0].children.find((c: any) => c.type === "inspectGlb");
    expect(inspect.output.warnings).to.deep.equal(body.task.output.warnings);
    expect(inspect.output.messages).to.deep.equal(body.task.output.messages);
  });

  describe("rejects", function(){
    /** The test's upload can still be processed */
    async function stillInitializing(){
      expect(await taskScheduler.getTask(task)).to.have.property("status", "initializing");
    }

    for(const [name, body] of [
      ["no body", undefined],
      ["no main file", {}],
      ["an empty main file", {main: ""}],
      ["a non-string main file", {main: 12}],
    ] as const){
      it(name, async function(){
        await put(this, "foo.bin");
        await process(this, body).expect(400);
        await stillInitializing();
      });
    }

    it("a main file that wasn't sent", async function(){
      await put(this, "foo.bin");
      await process(this, {main: "bar.bin"}).expect(400);
      await stillInitializing();
    });

    it("a folder as main file", async function(){
      await put(this, "tex/foo.bin");
      await process(this, {main: "tex"}).expect(400);
      await stillInitializing();
    });

    for(const main of ["../foo.bin", "../.incomplete/foo.bin", "/etc/passwd"]){
      it(`a main file outside of the upload: ${main}`, async function(){
        await put(this, "foo.bin");
        await process(this, {main}).expect(400);
        await stillInitializing();
      });
    }

    it("an upload with incomplete files", async function(){
      await put(this, "foo.obj");
      await request(this.server).put(`/uploads/${task}/files/tex/diffuse.jpg`)
      .set("Authorization", this.authorization)
      .set("Content-Range", `bytes 0-3/16`)
      .send(randomBytes(4))
      .expect(206);
      const res = await process(this, {main: "foo.obj"}).expect(409);
      expect(res.body).to.have.property("message").match(/tex\/diffuse\.jpg/);
      await stillInitializing();
      //Completing it allows processing
      await put(this, "tex/diffuse.jpg");
      await process(this, {main: "foo.obj"}).expect(200);
    });

    it("an upload that was already processed", async function(){
      await put(this, "foo.bin");
      await process(this, {main: "foo.bin"}).expect(200);
      await process(this, {main: "foo.bin"}).expect(409);
    });

    it("concurrent processing requests", async function(){
      await put(this, "foo.bin");
      const statuses = (await Promise.all([
        process(this, {main: "foo.bin"}),
        process(this, {main: "foo.bin"}),
      ])).map(r => r.status).sort();
      expect(statuses).to.deep.equal([200, 409]);
    });

    it("tasks that are not uploads", async function(){
      const alice = await userManager.getUserByName("alice");
      const other = await taskScheduler.create({scene_id: null, user_id: alice.uid, type: "delayTask", data: {}, status: "initializing"});
      await request(this.server).post(`/uploads/${other.task_id}/process`)
      .set("Authorization", this.authorization)
      .send({main: "foo.bin"})
      .expect(404);
    });

    it("other users", async function(){
      await put(this, "foo.bin");
      await request(this.server).post(`/uploads/${task}/process`)
      .set("Authorization", await bearer("bob"))
      .send({main: "foo.bin"})
      .expect(401);
      await request(this.server).post(`/uploads/${task}/process`)
      .send({main: "foo.bin"})
      .expect(401);
      await stillInitializing();
    });
  });

  describe("localized parse errors", function(){
    /** Upload `data` as a `.glb` file and process it */
    async function uploadGlb(ctx: Mocha.Context, data: Buffer, lang?: string){
      const glbname = randomBytes(4).toString("hex")+".glb";
      const {task_id, res} = await sendUpload(ctx.server, await bearer("alice"), {files: {[glbname]: data}, lang});
      expect(res.status).to.equal(500);
      //The upload itself went fine: what failed is its processing
      expect(await taskScheduler.getTask(task_id)).to.have.property("status", "error");
      return {glbname, res};
    }

    it("reports a non-GLB file in english by default", async function(){
      const {glbname, res} = await uploadGlb(this, randomBytes(64));
      expect(res.body).to.have.property("message", `Error: ${glbname} does not look like a GLB file`);
    });

    it("reports a non-GLB file in the requested language", async function(){
      const {glbname, res} = await uploadGlb(this, randomBytes(64), "fr");
      expect(res.body).to.have.property("message", `Error: ${glbname} ne semble pas être un fichier GLB`);
    });

    it("reports a corrupted GLB file in the requested language", async function(){
      const cube = await fs.readFile(path.join(fixturesDir, "cube.glb"));
      const {glbname, res} = await uploadGlb(this, cube.subarray(0, cube.length / 2), "fr");
      expect(res.body).to.have.property("message").match(new RegExp(`^Error: ${glbname} n'a pas pu être lu comme un modèle 3D : .+`));
    });
  });
});

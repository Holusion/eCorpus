import request from "supertest";
import { randomBytes, randomInt } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import User from "../../../auth/User.js";
import UserManager from "../../../auth/UserManager.js";
import Vfs from "../../../vfs/index.js";
import { TaskScheduler } from "../../../tasks/scheduler.js";
import { getUploadStaging } from "../../../tasks/handlers/uploads.js";
import { fixturesDir } from "../../../__test_fixtures/fixtures.js";
import { glbToGltf } from "../../../__test_fixtures/gltf.js";
import { run } from "../../../utils/exec.js";


describe("PUT /uploads/:id/files/*path", function(){
  let vfs :Vfs, userManager :UserManager, taskScheduler :TaskScheduler, user :User, admin :User;
  let filename: string, size: number, task: number;

  this.beforeAll(async function(){
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager = locals.userManager;
    taskScheduler = locals.taskScheduler;
    user = await userManager.addUser("bob", "12345678");
    admin = await userManager.addUser("alice", "12345678", "admin");
  });

  this.beforeEach(async function(){
    //Create an upload for each test
    filename = randomBytes(4).toString("hex")+".bin";
    size = randomInt(16, 512);
    const {body} = await request(this.server).post("/uploads")
    .set("Authorization", await bearer("alice"))
    .send({})
    .expect(201);
    expect(body).to.have.property("task_id").a("number");
    task = body.task_id;
  });

  /** Absolute path of a complete file of the test's upload */
  function completePath(filepath: string){
    return path.join(getUploadStaging(vfs, task).files, filepath);
  }

  /** Send a file of the test's upload in chunks of `chunkSize` bytes */
  async function sendChunks(ctx: Mocha.Context, filepath: string, data: Buffer, chunkSize: number){
    let offset = 0;
    while(offset < data.length){
      const len = Math.min(data.length - offset, chunkSize);
      const res = await request(ctx.server).put(`/uploads/${task}/files/${filepath}`)
      .set("Authorization", await bearer("alice"))
      .set("Content-Range", `bytes ${offset}-${offset+len-1 /*end is inclusive*/}/${data.length}`)
      .send(data.subarray(offset, offset + len))
      .expect(offset + len < data.length? 206 : 201);
      offset += len;
      expect(res.headers).to.have.property("upload-offset", offset.toString());
    }
  }

  it("receives a file in one go (no headers)", async function(){
    const data = randomBytes(size);
    const res = await request(this.server).put(`/uploads/${task}/files/${filename}`)
    .set("Authorization", await bearer("alice"))
    .send(data)
    .expect(201);
    expect(res.body).to.deep.equal({path: filename, size});
    expect(res.headers).to.have.property("upload-offset", size.toString());
    expect(await fs.readFile(completePath(filename))).to.deep.equal(data);
  });

  it("receives a file in a single chunk (chunk headers)", async function(){
    const data = randomBytes(size);
    await request(this.server).put(`/uploads/${task}/files/${filename}`)
    .set("Authorization", await bearer("alice"))
    .set("Content-Range", `bytes 0-${size-1 /*end is inclusive*/}/${size}`)
    .send(data)
    .expect(201);
    expect(await fs.readFile(completePath(filename))).to.deep.equal(data);
  });

  it("receives a file in multiple chunks", async function(){
    const data = randomBytes(size);
    await sendChunks(this, filename, data, Math.floor(size / 4));
    expect(await fs.readFile(completePath(filename))).to.deep.equal(data);
  });

  it("only shows a file once it's complete", async function(){
    const data = randomBytes(size);
    const half = Math.floor(size/2);
    await request(this.server).put(`/uploads/${task}/files/${filename}`)
    .set("Authorization", await bearer("alice"))
    .set("Content-Range", `bytes 0-${half-1}/${size}`)
    .send(data.subarray(0, half))
    .expect(206);
    await expect(fs.access(completePath(filename))).to.be.rejectedWith("ENOENT");
  });

  it("receives empty files", async function(){
    const res = await request(this.server).put(`/uploads/${task}/files/empty.mtl`)
    .set("Authorization", await bearer("alice"))
    .send(Buffer.alloc(0))
    .expect(201);
    expect(res.body).to.deep.equal({path: "empty.mtl", size: 0, inspection: {requires: []}});
    expect(await fs.readFile(completePath("empty.mtl"))).to.have.length(0);
  });

  it("keeps the folder structure of an upload's files", async function(){
    const files: Record<string, Buffer> = {
      "model.obj": randomBytes(16),
      "model.mtl": randomBytes(16),
      "tex/diffuse.jpg": randomBytes(32),
      "tex/normals/normal.png": randomBytes(32),
    };
    for(const [filepath, data] of Object.entries(files)){
      const res = await request(this.server).put(`/uploads/${task}/files/${filepath}`)
      .set("Authorization", await bearer("alice"))
      .send(data)
      .expect(201);
      expect(res.body).to.have.property("path", filepath);
    }
    for(const [filepath, data] of Object.entries(files)){
      expect(await fs.readFile(completePath(filepath)), filepath).to.deep.equal(data);
    }
  });

  it("normalizes file paths", async function(){
    const res = await request(this.server).put(`/uploads/${task}/files/tex/./old/%2E%2E/diffuse.jpg`)
    .set("Authorization", await bearer("alice"))
    .send(randomBytes(16))
    .expect(201);
    expect(res.body).to.have.property("path", "tex/diffuse.jpg");
    await expect(fs.access(completePath("tex/diffuse.jpg"))).to.be.fulfilled;
  });

  it("decodes file names", async function(){
    const res = await request(this.server).put(`/uploads/${task}/files/${encodeURIComponent("my model")}/${encodeURIComponent("é#?.obj")}`)
    .set("Authorization", await bearer("alice"))
    .send(randomBytes(16))
    .expect(201);
    expect(res.body).to.have.property("path", "my model/é#?.obj");
  });

  it("replaces a file sent again", async function(){
    await request(this.server).put(`/uploads/${task}/files/${filename}`)
    .set("Authorization", await bearer("alice"))
    .send(randomBytes(size * 2))
    .expect(201);
    const data = randomBytes(size);
    await sendChunks(this, filename, data, Math.floor(size / 3));
    expect(await fs.readFile(completePath(filename))).to.deep.equal(data);
  });

  it("drops bytes past the end left by an earlier attempt", async function(){
    const half = Math.floor(size/2);
    //A first attempt at a larger file
    const first = randomBytes(size);
    await request(this.server).put(`/uploads/${task}/files/${filename}`)
    .set("Authorization", await bearer("alice"))
    .set("Content-Range", `bytes 0-${size-1}/${size * 2}`)
    .send(first)
    .expect(206);
    //Continued over it, as a smaller file
    const data = randomBytes(half - 2);
    await request(this.server).put(`/uploads/${task}/files/${filename}`)
    .set("Authorization", await bearer("alice"))
    .set("Content-Range", `bytes 2-${half-1}/${half}`)
    .send(data)
    .expect(201);
    expect(await fs.readFile(completePath(filename))).to.deep.equal(Buffer.concat([first.subarray(0, 2), data]));
  });

  describe("inspects the files a model refers to", function(){
    /** Send a whole file to the test's upload, and give the response's inspection */
    async function inspect(ctx: Mocha.Context, filepath: string, content: string|Buffer, lang?: string){
      let req = request(ctx.server).put(`/uploads/${task}/files/${filepath}`)
      .set("Authorization", await bearer("alice"));
      if(lang) req = req.set("Accept-Language", lang);
      const res = await req.send(Buffer.from(content)).expect(201);
      expect(res.body).to.have.property("path", filepath);
      return res.body.inspection;
    }

    it("of an OBJ", async function(){
      expect(await inspect(this, "cube.obj", "mtllib cube.mtl\nv 0 0 0\n")).to.deep.equal({requires: [["cube.mtl"]]});
    });

    it("relative to the upload's root", async function(){
      expect(await inspect(this, "scan/model.obj", "mtllib mtl/model.mtl\nv 0 0 0\n")).to.deep.equal({
        requires: [["scan/mtl/model.mtl", "scan/model.mtl"]],
      });
      expect(await inspect(this, "scan/mtl/model.mtl", "newmtl a\nmap_Kd tex/diffuse.jpg\nnewmtl b\nmap_Kd C:\\Users\\bob\\wall.png\n")).to.deep.equal({
        requires: [["scan/mtl/tex/diffuse.jpg", "scan/mtl/diffuse.jpg"], ["scan/mtl/wall.png"]],
      });
    });

    it("leading anywhere in the upload", async function(){
      //The conversion confines references to the model's folder, which is the upload's root
      expect(await inspect(this, "mtl/model.mtl", "newmtl a\nmap_Kd ../tex/diffuse.jpg\nnewmtl b\nmap_Kd ../../outside.jpg\n")).to.deep.equal({
        requires: [["tex/diffuse.jpg", "mtl/diffuse.jpg"], ["mtl/outside.jpg"]],
      });
    });

    describe("of a glTF", function(){
      this.beforeAll(async function(){
        const {stdout} = await run("meshtinker", ["inspect", "--help"]).catch(()=>({stdout: ""}));
        if(!stdout.includes("--no-data")) this.skip(); //meshtinker can't inspect a glTF without its files yet
      });

      it("with the files it refers to", async function(){
        const {json} = await glbToGltf(path.join(fixturesDir, "cube_textured.glb"));
        json.buffers[0].uri = "cube.bin";
        json.images[0].uri = "tex/diffuse.png";
        expect(await inspect(this, "model/cube.gltf", JSON.stringify(json))).to.deep.equal({
          requires: [["model/cube.bin"], ["model/tex/diffuse.png"]],
        });
      });

      it("requiring every texture, not only base colors", async function(){
        const {json} = await glbToGltf(path.join(fixturesDir, "cube_textured.glb"));
        json.buffers[0].uri = "cube.bin";
        json.images[0].uri = "diffuse.png";
        json.images.push({uri: "tex/normal.png"});
        json.textures.push({source: 1});
        json.materials[0].normalTexture = {index: 1};
        expect(await inspect(this, "cube.gltf", JSON.stringify(json))).to.deep.equal({
          requires: [["cube.bin"], ["diffuse.png"], ["tex/normal.png"]],
        });
      });

      it("with a texture outside of its folder", async function(){
        const {json} = await glbToGltf(path.join(fixturesDir, "cube_textured.glb"));
        json.images.push({uri: "../normal.png"});
        json.textures.push({source: 1});
        json.materials[0].normalTexture = {index: 1};
        const {error} = await inspect(this, "model/cube.gltf", JSON.stringify(json));
        expect(error).to.equal("cube.gltf could not be converted to a 3D model: image '../normal.png': not found, or outside the model's folder");
      });

      it("of a GLB, which needs nothing else", async function(){
        expect(await inspect(this, "cube.glb", await fs.readFile(path.join(fixturesDir, "cube.glb")))).to.deep.equal({
          requires: [],
        });
      });

      it("that refers outside of its folder", async function(){
        const {json} = await glbToGltf(path.join(fixturesDir, "cube.glb"));
        json.buffers[0].uri = "../cube.bin";
        const {error} = await inspect(this, "model/cube.gltf", JSON.stringify(json));
        expect(error).to.match(/^cube\.gltf could not be converted to a 3D model: .*outside the model's folder/);
      });
    });

    it("once the file is complete", async function(){
      const data = Buffer.from("mtllib cube.mtl\n" + "v 0 0 0\n".repeat(16));
      const res = await request(this.server).put(`/uploads/${task}/files/cube.obj`)
      .set("Authorization", await bearer("alice"))
      .set("Content-Range", `bytes 0-9/${data.length}`)
      .send(data.subarray(0, 10))
      .expect(206);
      expect(res.body).not.to.have.property("inspection");
      const {body} = await request(this.server).put(`/uploads/${task}/files/cube.obj`)
      .set("Authorization", await bearer("alice"))
      .set("Content-Range", `bytes 10-${data.length - 1}/${data.length}`)
      .send(data.subarray(10))
      .expect(201);
      expect(body).to.have.property("inspection").deep.equal({requires: [["cube.mtl"]]});
    });

    it("of an OBJ that refers to nothing", async function(){
      expect(await inspect(this, "cube.obj", "v 0 0 0\n")).to.deep.equal({requires: []});
    });

    it("not of other files", async function(){
      expect(await inspect(this, "notes.txt", "mtllib cube.mtl\n")).to.be.undefined;
      expect(await inspect(this, "model.wrl", "#VRML V2.0 utf8\n")).to.be.undefined;
    });

    it("tells why a file can't be converted", async function(){
      const {error} = await inspect(this, "remote.obj", "mtllib http://example.com/remote.mtl\n");
      expect(error).to.match(/^remote\.obj could not be converted to a 3D model: .*not found, or outside the model's folder/);
      //The file is received all the same
      expect(await fs.readFile(completePath("remote.obj"), "utf-8")).to.equal("mtllib http://example.com/remote.mtl\n");
    });

    it("tells why in the requested language", async function(){
      const {error} = await inspect(this, "remote.obj", "mtllib http://example.com/remote.mtl\n", "fr");
      expect(error).to.match(/^remote\.obj n'a pas pu être converti en modèle 3D : /);
    });
  });

  describe("rejects", function(){
    it("out-of-order bytes", async function(){
      const res = await request(this.server).put(`/uploads/${task}/files/${filename}`)
      .set("Authorization", await bearer("alice"))
      .set("Content-Range", `bytes 10-15/${size}`)
      .send(randomBytes(6))
      .expect(416);
      expect(res.body).to.have.property("message", `Error: [416] Missing bytes 0-10`);
      expect(res.headers).to.have.property("upload-offset", "0");
    });

    it("chunks of an unknown total size", async function(){
      await request(this.server).put(`/uploads/${task}/files/${filename}`)
      .set("Authorization", await bearer("alice"))
      .set("Content-Range", `bytes 0-5/*`)
      .send(randomBytes(6))
      .expect(400);
    });

    it("chunks past the total size", async function(){
      await request(this.server).put(`/uploads/${task}/files/${filename}`)
      .set("Authorization", await bearer("alice"))
      .set("Content-Range", `bytes 0-5/5`)
      .send(randomBytes(6))
      .expect(416);
    });

    it("a Content-Length that doesn't match the range", async function(){
      await request(this.server).put(`/uploads/${task}/files/${filename}`)
      .set("Authorization", await bearer("alice"))
      .set("Content-Range", `bytes 0-9/${size}`)
      .send(randomBytes(6))
      .expect(400);
    });

    for(const name of [
      "%2E%2E/escape.bin",
      "%2E%2E%2F%2E%2E%2Fescape.bin",
      "foo/%2E%2E/%2E%2E/escape.bin",
      //Inside the upload's workspace, but not among its files
      "%2E%2E/.incomplete/escape.bin",
      "%2Ftmp%2Fescape.bin",
    ]){
      it(`a path outside of the upload: ${name}`, async function(){
        await request(this.server).put(`/uploads/${task}/files/${name}`)
        .set("Authorization", await bearer("alice"))
        .send(randomBytes(16))
        .expect(400);
        const workspace = vfs.getTaskWorkspace(task);
        for(const p of [path.join(workspace, "escape.bin"), path.join(workspace, ".incomplete", "escape.bin"), path.join(workspace, "..", "escape.bin")]){
          await expect(fs.access(p), p).to.be.rejectedWith("ENOENT");
        }
      });
    }

    it("a file where a folder is", async function(){
      await request(this.server).put(`/uploads/${task}/files/tex/diffuse.jpg`)
      .set("Authorization", await bearer("alice"))
      .send(randomBytes(16))
      .expect(201);
      await request(this.server).put(`/uploads/${task}/files/tex`)
      .set("Authorization", await bearer("alice"))
      .send(randomBytes(16))
      .expect(409);
    });

    it("a folder where a file is", async function(){
      await request(this.server).put(`/uploads/${task}/files/tex`)
      .set("Authorization", await bearer("alice"))
      .send(randomBytes(16))
      .expect(201);
      await request(this.server).put(`/uploads/${task}/files/tex/diffuse.jpg`)
      .set("Authorization", await bearer("alice"))
      .send(randomBytes(16))
      .expect(409);
    });

    it("data sent to a processed upload", async function(){
      const data = randomBytes(size);
      await request(this.server).put(`/uploads/${task}/files/${filename}`)
      .set("Authorization", await bearer("alice"))
      .send(data)
      .expect(201);
      await request(this.server).post(`/uploads/${task}/process`)
      .set("Authorization", await bearer("alice"))
      .send({main: filename})
      .expect(200);
      await request(this.server).put(`/uploads/${task}/files/${filename}`)
      .set("Authorization", await bearer("alice"))
      .send(data)
      .expect(409);
      await request(this.server).put(`/uploads/${task}/files/other.bin`)
      .set("Authorization", await bearer("alice"))
      .send(data)
      .expect(409);
    });

    it("tasks that are not uploads", async function(){
      const other = await taskScheduler.create({scene_id: null, user_id: admin.uid, type: "delayTask", data: {}, status: "initializing"});
      await request(this.server).put(`/uploads/${other.task_id}/files/foo.bin`)
      .set("Authorization", await bearer("alice"))
      .send(randomBytes(16))
      .expect(404);
    });

    it("other users", async function(){
      await request(this.server).put(`/uploads/${task}/files/${filename}`)
      .set("Authorization", await bearer("bob"))
      .send(randomBytes(size))
      .expect(401);
      await request(this.server).put(`/uploads/${task}/files/${filename}`)
      .send(randomBytes(size))
      .expect(401);
      await expect(fs.access(completePath(filename))).to.be.rejectedWith("ENOENT");
    });
  });
});


describe("HEAD /uploads/:id/files/*path", function(){
  let userManager :UserManager;
  let size: number, task: number;

  this.beforeAll(async function(){
    let locals = await createIntegrationContext(this);
    userManager = locals.userManager;
    await userManager.addUser("alice", "12345678", "admin");
    await userManager.addUser("bob", "12345678");
  });

  this.beforeEach(async function(){
    size = randomInt(16, 512);
    const {body} = await request(this.server).post("/uploads")
    .set("Authorization", await bearer("alice"))
    .send({})
    .expect(201);
    task = body.task_id;
  });

  it("is 404 before any data is received", async function(){
    await request(this.server).head(`/uploads/${task}/files/foo.bin`)
    .set("Authorization", await bearer("alice"))
    .expect(404);
  });

  it("tells where to resume an incomplete file", async function(){
    const data = randomBytes(size);
    const half = Math.floor(size/2);
    await request(this.server).put(`/uploads/${task}/files/tex/foo.bin`)
    .set("Authorization", await bearer("alice"))
    .set("Content-Range", `bytes 0-${half-1}/${size}`)
    .send(data.subarray(0, half))
    .expect(206);

    const res = await request(this.server).head(`/uploads/${task}/files/tex/foo.bin`)
    .set("Authorization", await bearer("alice"))
    .expect(200);
    expect(res.headers).to.have.property("upload-offset", half.toString());
    expect(res.headers).to.have.property("upload-complete", "?0");
    expect(res.headers).to.have.property("cache-control", "no-store");

    //Resume from there
    const offset = parseInt(res.headers["upload-offset"]);
    await request(this.server).put(`/uploads/${task}/files/tex/foo.bin`)
    .set("Authorization", await bearer("alice"))
    .set("Content-Range", `bytes ${offset}-${size-1}/${size}`)
    .send(data.subarray(offset))
    .expect(201);
  });

  it("tells a file is complete", async function(){
    await request(this.server).put(`/uploads/${task}/files/foo.bin`)
    .set("Authorization", await bearer("alice"))
    .send(randomBytes(size))
    .expect(201);
    const res = await request(this.server).head(`/uploads/${task}/files/foo.bin`)
    .set("Authorization", await bearer("alice"))
    .expect(200);
    expect(res.headers).to.have.property("upload-offset", size.toString());
    expect(res.headers).to.have.property("upload-complete", "?1");
  });

  it("is 404 for a folder", async function(){
    await request(this.server).put(`/uploads/${task}/files/tex/foo.bin`)
    .set("Authorization", await bearer("alice"))
    .send(randomBytes(size))
    .expect(201);
    await request(this.server).head(`/uploads/${task}/files/tex`)
    .set("Authorization", await bearer("alice"))
    .expect(404);
  });

  it("rejects other users", async function(){
    await request(this.server).put(`/uploads/${task}/files/foo.bin`)
    .set("Authorization", await bearer("alice"))
    .send(randomBytes(size))
    .expect(201);
    await request(this.server).head(`/uploads/${task}/files/foo.bin`)
    .set("Authorization", await bearer("bob"))
    .expect(401);
  });
});

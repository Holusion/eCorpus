import fs from "node:fs/promises";
import { TaskScheduler } from "../scheduler.js";
import { toGlb } from "./toGlb.js";
import path from "node:path";
import Vfs from "../../vfs/index.js";
import { randomBytes } from "node:crypto";
import { inspectGlb } from "./inspectGlb.js";



describe("Task: toGlb", function () {
  let taskScheduler: TaskScheduler, vfs: Vfs;
  this.beforeAll(async function () {
    const locals = await createIntegrationContext(this);
    taskScheduler = locals.taskScheduler;
    vfs = locals.vfs;
  });
  this.afterAll(async function () {
    await cleanIntegrationContext(this);
  });

  describe("Wavefront OBJ", function () {
    it("converts simple OBJ file ", async function () {
      const name = `${randomBytes(2).toString("hex")}-dummy`;
      const fileLocation = vfs.relative(name + ".obj");
      await fs.writeFile(vfs.absolute(fileLocation), `v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n`);
      const out = await taskScheduler.run({
        handler: toGlb,
        data: { fileLocation }
      });
      expect(out).to.have.property("fileLocation").a("string");
      expect(path.basename(out.fileLocation)).to.equal(name + ".glb");

      const meta = await taskScheduler.run({ handler: inspectGlb, data: out });
      console.log("Meta: ", meta);
      expect(meta).to.have.property("numFaces", 1);
    });

    it.skip("fails on missing mtl file", async function () {
      const name = `${randomBytes(2).toString("hex")}-dummy`;
      const fileLocation = vfs.relative(name + ".obj");
      await fs.writeFile(vfs.absolute(fileLocation), `mtllib cube.mtl\no Cube\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n`);
      await expect(taskScheduler.run({
        handler: toGlb,
        data: { fileLocation }
      })).to.be.rejectedWith("ENOENT");
    });
  });
});

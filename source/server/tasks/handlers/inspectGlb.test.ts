import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

import { TaskScheduler } from "../scheduler.js";
import Vfs from "../../vfs/index.js";
import type { RootRelativePath } from "../../vfs/Base.js";
import { fixturesDir } from "../../__test_fixtures/fixtures.js";
import { glbToGltf } from "../../__test_fixtures/gltf.js";
import { inspectGlb } from "./inspectGlb.js";



describe("Task: inspectGlb", function () {
  let taskScheduler: TaskScheduler, vfs: Vfs;
  this.beforeAll(async function () {
    const locals = await createIntegrationContext(this);
    taskScheduler = locals.taskScheduler;
    vfs = locals.vfs;
  });

  /**
   * Write a copy of cube.glb as a .gltf + .bin pair, with `extensionsRequired` set to the provided list
   */
  async function writeCube(extensions: string[]): Promise<RootRelativePath> {
    const name = `${randomBytes(2).toString("hex")}-cube`;
    const {json, files} = await glbToGltf(path.join(fixturesDir, "cube.glb"));
    json.extensionsUsed = [...(json.extensionsUsed ?? []), ...extensions];
    json.extensionsRequired = [...(json.extensionsRequired ?? []), ...extensions];
    const [bin] = Object.keys(files);
    json.buffers[0].uri = `${name}.bin`;
    await fs.writeFile(vfs.absolute(`${name}.bin`), files[bin]);
    const fileLocation = vfs.relative(`${name}.gltf`);
    await fs.writeFile(vfs.absolute(fileLocation), JSON.stringify(json));
    return fileLocation;
  }

  it("inspects files requiring KHR_texture_transform", async function () {
    const fileLocation = await writeCube(["KHR_texture_transform"]);
    const meta = await taskScheduler.run({ handler: inspectGlb, data: { fileLocation } });
    expect(meta).to.have.property("numFaces", 12);
    expect(meta.extensions).to.include("KHR_texture_transform");
  });

  it("inspects files requiring an unsupported extension", async function () {
    const fileLocation = await writeCube(["FOO_unknown_extension"]);
    const meta = await taskScheduler.run({ handler: inspectGlb, data: { fileLocation } });
    expect(meta).to.have.property("numFaces", 12);
    expect(meta.bounds).to.deep.equal({
      min: [-1, -1, -1],
      max: [1, 1, 1],
    });
  });
});

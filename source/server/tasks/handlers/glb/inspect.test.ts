import { expect } from "chai";
import path from "path";
import { fileURLToPath } from 'url';

const thisFile = fileURLToPath(import.meta.url);

import { fixturesDir } from "../../../__test_fixtures/fixtures.js";
import { getBaseTextureSizeMultiplier, inspectGlb } from "./inspect.js";


describe("inspectGlb()", function(){

  const cube = path.resolve(fixturesDir, "cube.glb" );
  const cube_textured = path.resolve(fixturesDir, "cube_textured.glb");
  const cube_draco = path.resolve(fixturesDir, "cube_draco.glb" );
  it("Generates a report for a glb file", async function(){
    expect(await inspectGlb(cube)).to.deep.equal({
      name: "Cube",
      bounds: {
        min: [-1, -1, -1],
        max: [1, 1, 1],
      },
      imageSize: 0,
      numFaces: 12,
      extensions: [],
    });
  });

  it("Finds texture sizes", async function(){
    expect(await inspectGlb(cube_textured)).to.deep.equal({
      name: "Cube",
      bounds: {
        min: [-1, -1, -1],
        max: [1, 1, 1],
      },
      imageSize: 16,
      numFaces: 12,
      extensions: [],
    });
  });

  it("opens draco-compressed mesh", async function(){
    expect(await inspectGlb(cube_draco)).to.deep.equal({
      name: "Cube",
      bounds: {
        min: [-1, -1, -1],
        max: [1, 1, 1],
      },
      imageSize: 0,
      numFaces: 12,
      extensions: ["KHR_draco_mesh_compression"],
    });
  })
});


describe("getBaseTextureSizeMultiplier()", function(){
  it("scales down to 8k textures", function(){
    expect(getBaseTextureSizeMultiplier(8192)).to.equal(1);
    expect(getBaseTextureSizeMultiplier(8192*2)).to.equal(1/2);
    expect(getBaseTextureSizeMultiplier(8192*1.5)).to.equal(1/1.5);
  });

  it("won't upscale", function(){
    expect(getBaseTextureSizeMultiplier(1024)).to.equal(1);
    expect(getBaseTextureSizeMultiplier(2048)).to.equal(1);
  });
});
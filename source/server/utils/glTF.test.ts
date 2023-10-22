import { expect } from "chai";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from 'url';
import { parse_glb, parse_glTF } from "./glTF.js";

const thisFile = fileURLToPath(import.meta.url);
const thisDir = path.dirname(thisFile);
describe("parse_glb()", function(){

  it("parse a glb file to extract data", async function(){
    let d = await parse_glb(path.resolve(thisDir, "../__test_fixtures/cube.glb" ));
    expect(d).to.deep.equal({
      meshes:[{
        numFaces: 6*2 /*it takes two triangles to make a square and 6 squares for a cube */,
        bounds:{
          min: [-1,-1,-1],
          max: [1,1,1.000001]
        },
        position: [0,0,0],
        name: "Cube",
      }],
      bounds:{
        min: [-1,-1,-1],
        max: [1,1,1.000001]
      },
      byteSize: 5500,
    })
  });
  it("throw an error for invalid files", async function(){
    await expect(parse_glb( thisFile)).to.be.rejectedWith("bad magic number");
  })
});


describe("parse_gltf()", function(){
  it("handles morph targets", async function(){
    let data = await fs.readFile(path.resolve(thisDir, "../__test_fixtures/morph.gltf" ), {encoding: "utf8"});
    let gltf = JSON.parse(data);
    let res = parse_glTF(gltf);
    expect(res).to.deep.equal({
      meshes:[{
        numFaces: 64,
        position: [0,0,0],
        bounds: {min: [-0.5,0,-0.5], max: [0.5,0.20000000298023224,0.5]},
        name: "mesh"
      }],
      bounds: {min: [-0.5,0,-0.5], max: [0.5,0.20000000298023224,0.5]},
    });
  })
  // @todo add more edge-cases from https://github.com/KhronosGroup/glTF-Sample-Models
})
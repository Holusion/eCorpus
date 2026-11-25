import { expect } from "chai";
import path from "path";

import { fixturesDir } from "../../__test_fixtures/fixtures.js";
import { meshtinker, type InspectReport } from "../meshtinker.js";
import { describeModel } from "./inspect.js";

describe("describeModel()", function(){

  for(const fixture of ["cube_etc1s.glb", "cube_webp.glb"]){
    it(`describes ${fixture}`, async function(){
      const report = await meshtinker<InspectReport>("inspect", [path.join(fixturesDir, fixture)]);
      expect(describeModel(report)).to.deep.equal({
        name: "Cube",
        numFaces: 12,
        imageSize: 16,
        extensions: report.extensions.used,
        bounds: {
          min: [-1, -1, -1],
          max: [1, 1, 1],
        },
      });
    });
  }

  /** A report of a model without geometry nor images */
  function emptyReport(scene: InspectReport["scene"]): InspectReport{
    return {
      format: 1,
      tool: {name: "meshtinker-inspect", version: "0.1.0"},
      input: {byteSize: 48, files: []},
      extensions: {used: [], required: []},
      scene,
      geometry: {meshes: 0, primitives: 0, vertices: 0, faces: 0},
      images: [],
      diagnostics: [],
    };
  }

  it("describes a model without a scene", function(){
    expect(describeModel(emptyReport(null))).to.deep.equal({
      name: "",
      bounds: null,
      imageSize: 0,
      numFaces: 0,
      extensions: [],
    });
  });

  it("names a model after its scene when no root node has a name", function(){
    const desc = describeModel(emptyReport({index: 0, name: "Scene", firstNamedRootNode: null, bounds: null}));
    expect(desc).to.have.property("name", "Scene");
    expect(desc).to.have.property("bounds", null);
  });

  it("only measures images a base color uses", function(){
    const report = emptyReport(null);
    const image = {index: 0, name: null, file: null, mimeType: "image/jpeg", byteSize: 1, occupancy: null};
    report.images = [
      {...image, width: 64, height: 32, uses: [{material: 0, slot: "baseColorTexture", texture: 0}]},
      {...image, index: 1, width: 128, height: 128, uses: [{material: 0, slot: "normalTexture", texture: 1}]},
    ];
    expect(describeModel(report)).to.have.property("imageSize", 64);
  });
});

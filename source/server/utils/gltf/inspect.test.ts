import { expect } from "chai";
import path from "path";

import { fixturesDir } from "../../__test_fixtures/fixtures.js";
import { io } from "./io.js";
import { inspectDocument } from "./inspect.js";

describe("inspectDocument()", function(){

  it("parse etc1s texture size", async function(){
    const document = await io.read(path.join(fixturesDir, "cube_etc1s.glb"));
    const desc = inspectDocument(document);
    expect(desc).to.be.an("object");
    expect(desc.name).to.equal("Cube");
    expect(desc.numFaces).to.equal(12);
    expect(desc.imageSize).to.equal(16);
    expect(desc.extensions).to.be.an("array");
    expect(desc.bounds).to.deep.equal({
      min: [-1, -1, -1],
      max: [1, 1, 1],
    });
  });

  it("parse webp texture size", async function(){
    const document = await io.read(path.join(fixturesDir, "cube_webp.glb"));
    const desc = inspectDocument(document);
    expect(desc).to.be.an("object");
    expect(desc.name).to.equal("Cube");
    expect(desc.numFaces).to.equal(12);
    expect(desc.imageSize).to.equal(16);
    expect(desc.extensions).to.be.an("array");
    expect(desc.bounds).to.deep.equal({
      min: [-1, -1, -1],
      max: [1, 1, 1],
    });
  });

});

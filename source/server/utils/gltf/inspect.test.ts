import { expect } from "chai";
import path from "path";
import { Document } from "@gltf-transform/core";
import type { Primitive } from "@gltf-transform/core";

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

  it("returns no bounds=null for empty models", async function(){
    const document = new Document();
    const desc = inspectDocument(document);
    expect(desc).to.be.an("object");
    expect(desc.name).to.equal("");
    expect(desc.numFaces).to.equal(0);
    expect(desc.imageSize).to.equal(0);
    expect(desc.bounds).to.be.null;
  });

  it("handles a scene with a mesh that has empty geometry", async function(){
    const document = new Document();
    const scene = document.createScene("Scene");
    scene.setName("Scene");
    document.getRoot().setDefaultScene(scene);
    const node = document.createNode("Node");
    scene.addChild(node);
    const mesh = document.createMesh("Mesh");
    // no primitives added — mesh with empty geometry
    node.setMesh(mesh);

    const desc = inspectDocument(document);
    expect(desc.numFaces).to.equal(0);
    expect(desc.bounds, `${JSON.stringify(desc.bounds)}`).to.be.null;
  });

  it("handles a scene with a single point", async function(){
    const document = new Document();
    const scene = document.createScene("Scene");
    scene.setName("Scene");
    document.getRoot().setDefaultScene(scene);
    const node = document.createNode("Node");
    scene.addChild(node);
    const mesh = document.createMesh("Mesh");
    const primitive = document.createPrimitive();
    primitive.setMode(0 as Parameters<Primitive["setMode"]>[0]); // POINTS
    const accessor = document.createAccessor().setType("VEC3").setArray(new Float32Array([1, 2, 3]));
    primitive.setAttribute("POSITION", accessor);
    mesh.addPrimitive(primitive);
    node.setMesh(mesh);

    const desc = inspectDocument(document);
    // POINTS mode (0) has no faces
    expect(desc.numFaces).to.equal(0);
    expect(desc.bounds).to.deep.equal({ min: [1, 2, 3], max: [1, 2, 3] });
  });

});

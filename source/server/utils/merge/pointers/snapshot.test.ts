import { mapTarget, unmapTarget } from "./snapshot.js";
import { SOURCE_INDEX } from "./types.js";


describe("mapTarget()", function(){
  
  it("Keeps identity for indices not expected to change", function(){
    [
      "scenes/0/setup/reader/enabled",
      "scenes/0/setup/viewer/annotationsVisible",
      "scenes/0/setup/reader/position",
    ].forEach((t)=>{
      expect(mapTarget(t, [])).to.deep.equal(t);
    });
  });

  it("dereferences nodes", function(){
    expect(mapTarget("node/0/position", [
      {id: "foo", name: "node1"},
    ])).to.equal("node/foo/position");
  });

  it("dereferences models", function(){
    expect(mapTarget("model/0/position", [
      {id: "foo", name: "node1", model: {[SOURCE_INDEX]: 0} as any},
    ])).to.equal("model/foo/position");
  });

  it("derefences lights", function(){
    expect(mapTarget("light/0/position", [
      {id: "foo", name: "node1", light: {[SOURCE_INDEX]: 0} as any},
    ])).to.equal("light/foo/position");
  });


  it("throws an error if node is missing", function(){
    expect(()=>mapTarget("light/1/position", [
      {id: "foo", name: "node1", light: {[SOURCE_INDEX]: 0} as any},
    ])).to.throw('does not point to a valid light index');
  });
});

describe("unmapTarget()", function(){
  it("Keeps identity for indices not expected to change", function(){
    [
      "scenes/0/setup/reader/enabled",
      "scenes/0/setup/viewer/annotationsVisible",
      "scenes/0/setup/reader/position",
    ].forEach((t)=>{
      expect(unmapTarget(t, [])).to.equal(t);
    });
  });

  it("references nodes", function(){
    expect(unmapTarget("node/foo/position", [
      {id: "foo", name: "node1"},
    ])).to.equal("node/0/position");

    expect(unmapTarget("node/foo/position", [
      {id: "bar", name: "node2"},
      {id: "foo", name: "node1"},
    ])).to.equal("node/1/position");
  });

  it("dereferences models", function(){
    expect(unmapTarget("model/foo/position", [
      {id: "foo", name: "node1", model: 0},
    ])).to.equal("model/0/position");
  });

  it("derefences lights", function(){
    expect(unmapTarget("light/foo/position", [
      {id: "foo", name: "node1", light: 0},
    ])).to.equal("light/0/position");
  });


  it("throws an error if node is missing", function(){
    expect(()=>unmapTarget("light/bar/position", [
      {id: "foo", name: "node1", light: 0},
    ])).to.throw('can\'t find node with id : bar');
  });

  it("throws an error if node has a bad type", function(){
    expect(()=>unmapTarget("light/bar/position", [
      {id: "foo", name: "node1", light: 0},
      {id: "bar", name: "node2", model: 0},
    ])).to.throw('does not point to a valid light reference');
  });
});
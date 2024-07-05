import fs from "fs/promises";
import path from "path";

import { fixturesDir } from "../../__test_fixtures/fixtures.js";



import { IDocument, INode } from "../schema/document.js";
import {DELETE_KEY, apply, applyDoc, diff, diffDoc} from "./index.js";
import { ISetup } from "../schema/setup.js";
import { DerefScene, DerefSnapshots } from "./pointers/types.js";



describe("fast-forward", function(){
  /**
   * Tests that any identified trivial case is indeed handled properly
   */
  it("node rename", function(){
    const ref = {nodes:{foo:{name:"foo"}}};
    const next = {nodes:{bar:{name:"bar"}}};
    expect(apply(ref, diff<any>(ref, next))).to.deep.equal({nodes:{bar:{name:"bar"}}});
  });
})

describe("three-way merge", function(){
  /* 
   * For consistency, tests should follow the following naming scheme:
   * a *ref* as the common source, 
   * a *current* as the document that have been saved in-between
   * a *next* as the document that is being saved now
   */

  it("string update", function(){
    /** @TODO could try to do string splicing for finer results */
    const ref = {greet:"Hello", name:"World"};
    const current = {greet:"Hi", name:"World"};
    const next = {greet:"Hello", name:"Universe"};
    expect(apply(current, diff(ref, next))).to.deep.equal({greet:"Hi", name:"Universe"});
  });

  it("array replace", function(){
    const ref = {a:[1]};
    const current = {a:[1,2]};
    const next = {a:[1,3,4]};
    expect(apply(current, diff(ref, next))).to.deep.equal({a:[1,3,4]});
  });
});


describe("merge documents", function(){
  let docString :string, doc :IDocument;
  this.beforeAll(async function(){
    docString = await fs.readFile(path.resolve(fixturesDir, "documents/01_simple.svx.json"), "utf8");
  });
  this.beforeEach(function(){
    doc = JSON.parse(docString);
  });
  it("merge simple document changes", function(){
    const current = JSON.parse(docString);
    current.lights.push({type:"ambiant"});

    current.nodes.push({
      "id": "QE4H7dSQw9sY",
      "name": "Ambiant Light",
      "light": 1,
    });
    current.nodes.find( (n:INode) =>n.name=="Lights").children.push(current.nodes.length-1);


    const next = JSON.parse(docString);
    next.lights.push({type:"directional"});

    next.nodes.push({
      "id": "bCZEzSXPERGa",
      "name": "Directional Light",
      "light": 1,
    });
    next.nodes.find( (n:INode) =>n.name=="Lights").children.push(next.nodes.length-1);
    const d = diffDoc(doc, next);
    
    const result = applyDoc(current, d);
    
    expect(result.nodes, "merged nodes").to.deep.equal([
      (doc.nodes as any)[0], //The camera
      {id: "QE4H7dSQw9sY", name: "Lights", children: [2, 3, 4]},
      (doc.nodes as any)[2], //The base light (index 2)
      { //index 3
        "id": "QE4H7dSQw9sY",
        "name": "Ambiant Light",
        "light": 1,
      },
      { //index 4
        "name": "Directional Light",
        "id": "bCZEzSXPERGa",
        "light": 2,
      },
      (doc.nodes as any)[3], //The model
    ]);
    expect(result.lights).to.deep.equal([
      ...(doc.lights as any),
      {type: "ambiant"},
      {type:"directional"}
    ])
  });

  it("merge updated tours", async function(){
    const [
      doc,
      current,
      next,
    ] = await Promise.all([
      "02_tours.svx.json",
      "03_tours.svx.json",
      "04_tours.svx.json",
    ].map( async (file) => {
      const str = await fs.readFile(path.resolve(fixturesDir, "documents/", file), {encoding:"utf8"});
      return JSON.parse(str);
    }));

    const d = diffDoc(doc, next);
    const result = applyDoc(current, d);
    expect(result.setups).to.have.length(1);
    const {snapshots} = (result.setups as Required<ISetup>[])[0];
    expect(snapshots).to.have.property("targets").to.deep.equal([
      "model/0/visible",
      "node/0/position",
      "node/0/scale"
    ]);
    expect(snapshots).to.have.property("states").to.have.length(3);
    const values = [];
    for(let idx = 0; idx < 3; idx++){
      values.push(snapshots.states.map(s=>s.values[idx]));
    }
    expect(values[0]).to.deep.equal([true, true, false]);
    expect(values[1]).to.deep.equal([[0,0,0], [1,1,0], [0,0,0]]);
    expect(values[2]).to.deep.equal([[1,1,1], [2,2,2], [1,1,1]]);
  });

  it("merge added tour steps", function(){
    const doc = JSON.parse(docString);
    doc.setups[0].tours = [{
      "id": "fxQkZ9rUwNAU",
      "steps": [
        {"id": "gLi0xz", "titles": {"EN": "New Step #0"}},
        {"id": "bdh7ob", "titles": {"EN": "New Step #1"}}
      ]
    }];

    const current = JSON.parse(docString);
    current.setups[0].tours = [{
      "id": "fxQkZ9rUwNAU",
      "steps": [
        {"id": "gLi0xz", "titles": {"EN": "New Step #0"}},
        {"id": "bdh7ob", "titles": {"EN": "New Step #1"}},
        {"id": "bYMguT", "titles": {"EN": "New Step #2"}}
      ]
    }];

    const next = JSON.parse(docString);
    next.setups[0].tours = [{
      "id": "fxQkZ9rUwNAU",
      "steps": [
        {"id": "gLi0xz", "titles": {"EN": "New Step #0"}},
      ]
    }];
    const d = diffDoc(doc, next);

    expect((d?.scene as DerefScene)?.setup?.tours).to.have.property("fxQkZ9rUwNAU");

    const result = applyDoc(current, d);
    expect(result.setups).to.have.length(1);
    const setup = (result.setups as any)[0]
    expect(setup, JSON.stringify(setup.tours, null, 2)).to.have.property("tours").to.deep.equal([{
      "id": "fxQkZ9rUwNAU",
      "steps": [
        {"id": "gLi0xz", "titles": {"EN": "New Step #0"}},
        {"id": "bYMguT", "titles": {"EN": "New Step #2"}}
      ]
    }]);
  })
  
  it("detects a no-op", function(){
    const current = JSON.parse(docString);
    const next = JSON.parse(docString);
    const d = diffDoc(doc, next);
    expect(d, JSON.stringify(d)).to.deep.equal({});
    
    const result = applyDoc(current, d);
    expect(result, JSON.stringify(result)).to.deep.equal(current);
  });
})
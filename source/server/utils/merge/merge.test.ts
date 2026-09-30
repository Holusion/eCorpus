import fs from "fs/promises";
import path from "path";

import { fixturesDir } from "../../__test_fixtures/fixtures.js";



import { IDocument, INode } from "../schema/document.js";
import { apply, applyDoc, diff, diffDoc } from "./index.js";
import { ISetup } from "../schema/setup.js";
import { DerefScene, fromMap, SOURCE_INDEX, toIdMap } from "./pointers/types.js";



describe("fast-forward", function(){
  /**
   * Tests that any identified trivial case is indeed handled properly
   */
  it("node rename", function(){
    const ref = {nodes:{foo:{name:"foo"}}};
    const next = {nodes:{bar:{name:"bar"}}};
    expect(apply(ref, diff<any>(ref, next))).to.deep.equal({nodes:{bar:{name:"bar"}}});
  });

  it("keys reordering", function(){
    const ref = {keys: toIdMap([{id: "a"}, {id:"b"}, {id: "c"}])};
    const next = {keys: toIdMap([{id: "c"}, {id:"a"}, {id: "b"}])};
    const d = diff<any>(ref, next);
    const result = apply(ref, d);
    expect(result).to.have.property("keys").an("object");
    expect(fromMap(result.keys), `Array order should have been kept`).to.deep.equal([{id: "c"}, {id:"a"}, {id: "b"}]);
  });
});

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

  describe("fast-forward", function(){
    it("reorders tour steps", function(){
      const ref = JSON.parse(docString);
      ref.setups[0].tours = [{
        "id": "fxQkZ9rUwNAU",
        "steps": [
          {"id": "gLi0xz", "titles": {"EN": "New Step #0"}},
          {"id": "hdh7ob", "titles": {"EN": "New Step #1"}},
        ]
      }];

      const next = JSON.parse(docString);
      next.setups[0].tours = [{
        "id": "fxQkZ9rUwNAU",
        "steps": [
          {"id": "hdh7ob", "titles": {"EN": "New Step #1"}},
          {"id": "gLi0xz", "titles": {"EN": "New Step #0"}},
        ]
      }];

      const exp = JSON.parse(JSON.stringify(next));
      const d = diffDoc(doc, next);
      //console.log("Diff :", JSON.stringify(d, null, 2));

      const result = applyDoc(doc, d);

      //console.log("Merged doc :", JSON.stringify(result.setups![0].tours, null, 2));
      expect(result).to.deep.equal(exp);
    });

    it("reorders tour steps (bis)", async function(){
      //When reordering tour steps, their snapshots are not reordered
      docString = await fs.readFile(path.resolve(fixturesDir, "documents/04_tours.svx.json"), "utf8");
      const ref = JSON.parse(docString);

      const next = JSON.parse(docString);
      next.setups[0].tours = [{
        "id": "fxQkZ9rUwNAU",
        "steps": [
          ref.setups[0].tours[0].steps[1],
          ref.setups[0].tours[0].steps[0],
        ]
      }];

      const exp = JSON.parse(JSON.stringify(next));
      const d = diffDoc(doc, next);

      const result = applyDoc(doc, d);
      expect(result).to.deep.equal(exp);
    });
  });

  describe("three-way", function(){
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
      const setup = (result.setups as any)[0];
      expect(setup, JSON.stringify(setup.tours, null, 2)).to.have.property("tours").to.deep.equal([{
        "id": "fxQkZ9rUwNAU",
        "steps": [
          {"id": "gLi0xz", "titles": {"EN": "New Step #0"}},
          {"id": "bYMguT", "titles": {"EN": "New Step #2"}}
        ]
      }]);
    })
    
    it("skips a patch for an object that was removed concurrently", function(){
      //A tour is removed in `current` while we edit one of its steps.
      //Applying our patch would rebuild a tour holding nothing but the edited field.
      const ref = JSON.parse(docString);
      ref.setups[0].tours = [{
        "id": "fxQkZ9rUwNAU",
        "titles": {"EN": "Tour"},
        "steps": [
          {"id": "gLi0xz", "titles": {"EN": "New Step #0"}},
          {"id": "bdh7ob", "titles": {"EN": "New Step #1"}},
        ]
      }];

      const current = JSON.parse(JSON.stringify(ref));
      current.setups[0].tours = [];

      const next = JSON.parse(JSON.stringify(ref));
      next.setups[0].tours[0].titles = {"EN": "Edited by me"};

      const result = applyDoc(current, diffDoc(ref, next));
      expect(result.setups).to.have.length(1);
      expect((result.setups as any)[0].tours, "the removal wins over a partial patch").to.be.undefined;
    });

    it("still inserts a whole new object into a collection it left", function(){
      //The counterpart of the test above: the tour is new in `next`, so the diff carries
      //it whole and it must be adopted even though `current` has no tours at all.
      const ref = JSON.parse(docString);
      ref.setups[0].tours = [];

      const current = JSON.parse(JSON.stringify(ref));

      const next = JSON.parse(JSON.stringify(ref));
      next.setups[0].tours = [{
        "id": "fxQkZ9rUwNAU",
        "titles": {"EN": "Brand new tour"},
        "steps": [{"id": "gLi0xz", "titles": {"EN": "New Step #0"}}]
      }];
      //`diffDoc` stamps SOURCE_INDEX onto the documents it reads, so keep a clean copy
      const expected = JSON.parse(JSON.stringify(next.setups[0].tours));

      const result = applyDoc(current, diffDoc(ref, next));
      expect((result.setups as any)[0].tours).to.deep.equal(expected);
    });

    it("skips a patch for a node that was removed concurrently", function(){
      const ref = JSON.parse(docString);
      //Snapshots reference nodes by index; removing a targeted node is covered separately
      //in the snapshot tests. Keep this one about the node patch itself.
      delete ref.setups[0].snapshots;
      const victim = (ref.nodes as INode[]).find(n=>typeof n.model === "number")!;

      const current = JSON.parse(JSON.stringify(ref));
      current.scenes[0].nodes = current.scenes[0].nodes.filter(
        (idx :number)=> current.nodes[idx].id !== victim.id
      );

      const next = JSON.parse(JSON.stringify(ref));
      (next.nodes as INode[]).find(n=>n.id === victim.id)!.name = "Renamed by me";

      const result = applyDoc(current, diffDoc(ref, next));
      const zombie = (result.nodes as INode[]).find(n=>n.id === victim.id || n.name === "Renamed by me");
      expect(zombie, "no node should be rebuilt out of the patch").to.be.undefined;
    });

    it("drops snapshot targets pointing at a node that was removed concurrently", function(){
      //Voyager cleans up a deleted node's targets on its own, but the other side of a
      //merge may not have, and a target left dangling used to fail the whole save.
      const ref = JSON.parse(docString);
      const victimIdx = (ref.nodes as INode[]).findIndex(n=>typeof n.model === "number");
      const victim = (ref.nodes as INode[])[victimIdx];

      const current = JSON.parse(JSON.stringify(ref));
      current.scenes[0].nodes = current.scenes[0].nodes.filter((idx :number)=> idx !== victimIdx);

      const next = JSON.parse(JSON.stringify(ref));
      next.setups[0].snapshots = {
        features: ["position"],
        targets: [`node/${victimIdx}/position`, "scenes/0/setup/reader/enabled"],
        states: [{id: "aaaaaa", curve: "Linear", duration: 1, threshold: 0.5, values: [[1,2,3], true]}],
      };

      const result = applyDoc(current, diffDoc(ref, next));
      const {snapshots} = (result.setups as Required<ISetup>[])[0];
      expect(snapshots.targets, "the dangling target is gone").to.deep.equal(["scenes/0/setup/reader/enabled"]);
      expect(snapshots.states[0].values, "its column is gone from every state too").to.deep.equal([true]);
      expect((result.nodes as INode[]).find(n=>n.id === victim.id)).to.be.undefined;
    });

    it("detects a no-op", function(){
      const current = JSON.parse(docString);
      const next = JSON.parse(docString);
      const d = diffDoc(doc, next);
      expect(d).to.deep.equal({});
      
      const result = applyDoc(current, d);

      expect(result).to.deep.equal(current);
    });
  });  
})
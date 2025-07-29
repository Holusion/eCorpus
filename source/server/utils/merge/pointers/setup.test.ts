import { IDocument } from "../../schema/document.js";
import { appendSetup, mapSetup } from "./setup.js";
import { DerefSetup, SOURCE_INDEX } from "./types.js";


describe("appendSetup()", function(){
  let document :Required<IDocument>;
  this.beforeEach(()=>{
    document = {
      asset: {
        type: "application/si-dpo-3d.document+json",
        version: "1"
      },
      setups: [],
      scene: 0,
      scenes: [],
      nodes: [],
      cameras: [],
      lights: [],
      metas: [],
      models: []
    };
  });
  it("tours should always have a \"steps\" property", function(){
    // (As defined in ITour schema)
    const setup :DerefSetup = {
      tours: {
        "tour1": {[SOURCE_INDEX]: 0, id: "tour1", title: "Tour Title", steps: {}}
      },
      snapshots: {
        features: [],
        targets: {},
        states: {},
      }
    };
    const idx = appendSetup(document, setup);
    const iSetup = document.setups[idx];
    expect(iSetup.tours?.[0].steps).to.be.an("array");
  });

  it("restores snapshot targets indices", function(){
    document.nodes.push({});
    const setup :DerefSetup = {
      tours: {
        "tour1": {[SOURCE_INDEX]: 0, id: "tour1", title: "Tour Title", steps: {}}
      },
      snapshots: {
        features: [],
        targets: {
          'node/#0':{"position": 1},
          'scenes/0':{'setup/viewer/annotationsVisible': 0}
        },
        states: {},
      }
    };
    const idx = appendSetup(document, setup);
    const iSetup = document.setups[idx];
    expect(iSetup.snapshots?.targets).to.deep.equal([
      'scenes/0/setup/viewer/annotationsVisible',
      'node/0/position'
    ]);

  })
});

describe("mapSetup()", function(){

  it("maps additional properties", function(){
    expect(mapSetup({str: "txt", map: {foo: "bar"}} as any, [])).to.deep.include({
      str: "txt",
      map: {foo: "bar"},
    });
  });
})
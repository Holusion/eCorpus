import { IDocument } from "../../schema/document.js";
import { appendSetup } from "./setup.js";
import { DerefSetup } from "./types.js";


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
        "tour1": {id: "tour1", title: "Tour Title", steps: {}}
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
})
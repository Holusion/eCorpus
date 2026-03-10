import { TaskScheduler } from "../scheduler.js";
import { DocumentModel } from "./createDocumentFromFiles.js";
import { createDocumentFromFiles } from "./createDocumentFromFiles.js";


const makeModel = (opts: Partial<DocumentModel> = {}) => {
  return {
    uri: "foo.glb",
    byteSize: 100,
    numFaces: 0,
    imageSize: 0,
    bounds: null,
    quality: "High",
    usage: "Web3D",
    ...opts,
  } satisfies DocumentModel;
}


describe("Task createDocumentFromFiles", function () {
  let taskScheduler: TaskScheduler;
  this.beforeAll(async function () {
    await createIntegrationContext(this);
    taskScheduler = this.services.taskScheduler;
  });
  this.afterAll(async function () {
    await cleanIntegrationContext(this);
  })
  it("initializes a task scheduler", function () {
    expect(taskScheduler).to.be.instanceOf(TaskScheduler);
  });

  it("Creates a valid document", async function () {
    const outputDoc = await taskScheduler.run({
      handler: createDocumentFromFiles,
      data: {
        scene: "foo",
        language: "FR",
        models: [makeModel({ byteSize: 100, imageSize: 10, numFaces: 10, bounds: { min: [-1, -1, -1], max: [1, 1, 1] } })]
      }
    });
    expect(outputDoc.models).to.have.length(1);
    const model = outputDoc.models![0];
    console.log(JSON.stringify(model, null, 2));
    expect(model).to.have.property("boundingBox").to.deep.equal({ min: [-1, -1, -1], max: [1, 1, 1] });
    expect(model).to.have.property("derivatives").to.deep.equal([{
      "usage": "Web3D",
      "quality": "High",
      "assets": [
        {
          "uri": "foo.glb",
          "type": "Model",
          "byteSize": 100,
          "numFaces": 10,
          "imageSize": 10
        }
      ]
    }]);
  });

  it("Initializes the scene's name", async function () {
    const outputDoc = await taskScheduler.run({
      handler: createDocumentFromFiles,
      data: {
        scene: "foo",
        language: "FR",
        models: []
      }
    });
    expect(outputDoc).to.have.property("metas").to.have.length(1);
  });

  it("removes optional properties when necessary", async function () {
    //Handles a known exception where we report "no texture" as imageSize=0, while voyager requires imageSize >= 1 if present
    // Same thing with numFaces and bounds
    const outputDoc = await taskScheduler.run({
      handler: createDocumentFromFiles,
      data: {
        scene: "foo",
        language: "FR",
        models: [makeModel({ imageSize: 0 })]
      }
    });
    expect(outputDoc.models).to.have.length(1);
    const model = outputDoc.models![0];
    expect(model).not.to.have.property("boundingBox");
    expect(model).to.have.property("derivatives").to.have.length(1);
    expect(model.derivatives[0]).to.have.property("assets").to.have.length(1);
    const asset = model.derivatives[0].assets[0]
    expect(asset).to.have.property("type");
    expect(asset).not.to.have.property("imageSize");
    expect(asset).not.to.have.property("numFaces");
  });
});
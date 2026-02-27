import { TaskScheduler } from "../scheduler.js";
import { createDocumentFromFiles, DocumentModel } from "./uploads.js";


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


describe("createDocumentFromFiles() task", function () {
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
    expect(model).not.to.have.property("bounds");
    expect(model).to.have.property("derivatives").to.have.length(1);
    expect(model.derivatives[0]).to.have.property("assets").to.have.length(1);
    const asset = model.derivatives[0].assets[0]
    expect(asset).to.have.property("type");
    expect(asset).not.to.have.property("imageSize");
    expect(asset).not.to.have.property("numFaces");
    expect(asset).not.to.have.property("");
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
  })
});
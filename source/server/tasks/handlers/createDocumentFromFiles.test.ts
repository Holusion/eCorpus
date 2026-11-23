import { TaskScheduler } from "../scheduler.js";
import { DocumentDerivative, DocumentModel } from "./createDocumentFromFiles.js";
import { createDocumentFromFiles } from "./createDocumentFromFiles.js";


const makeDerivative = (opts: Partial<DocumentDerivative> = {}) => {
  return {
    uri: "foo.glb",
    byteSize: 100,
    numFaces: 0,
    imageSize: 0,
    quality: "High",
    usage: "Web3D",
    ...opts,
  } satisfies DocumentDerivative;
}

const makeModel = ({bounds = null, ...opts}: Partial<DocumentDerivative> & Pick<Partial<DocumentModel>, "bounds"> = {}) => {
  return {
    bounds,
    derivatives: [makeDerivative(opts)],
  } satisfies DocumentModel;
}


describe("Task createDocumentFromFiles", function () {
  let taskScheduler: TaskScheduler;
  this.beforeAll(async function () {
    await createIntegrationContext(this);
    taskScheduler = this.services.taskScheduler;
  });
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

  it("Writes every derivative of a model", async function () {
    const outputDoc = await taskScheduler.run({
      handler: createDocumentFromFiles,
      data: {
        scene: "foo",
        language: "FR",
        models: [{
          bounds: null,
          derivatives: [
            makeDerivative({ uri: "foo.glb", quality: "High", byteSize: 100, numFaces: 10 }),
            makeDerivative({ uri: "foo-thumb.glb", quality: "Thumb", byteSize: 10, numFaces: 2 }),
          ],
        }],
      }
    });
    expect(outputDoc.models).to.have.length(1);
    expect(outputDoc.nodes!.filter(n => typeof n.model === "number")).to.have.length(1);
    expect(outputDoc.models![0].derivatives).to.deep.equal([
      { usage: "Web3D", quality: "High", assets: [{ uri: "foo.glb", type: "Model", byteSize: 100, numFaces: 10 }] },
      { usage: "Web3D", quality: "Thumb", assets: [{ uri: "foo-thumb.glb", type: "Model", byteSize: 10, numFaces: 2 }] },
    ]);
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
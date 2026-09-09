import fs from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

import request from "supertest";

import User, { UserLevels } from "../../../../../auth/User.js";
import UserManager from "../../../../../auth/UserManager.js";
import uid from "../../../../../utils/uid.js";
import Vfs from "../../../../../vfs/index.js";

import { fixturesDir } from "../../../../../__test_fixtures/fixtures.js";

describe("PUT /scenes/:scene/scene.svx.json", function(){
  
  let vfs :Vfs, userManager :UserManager, user :User, admin :User;
  let sampleDocString :string;
  let titleSlug :string, scene_id :number, sampleDoc :any;
  let firstDocId :number;

  this.beforeAll(async function(){
    let locals = await createIntegrationContext(this);
    await locals.config.set("enable_document_merge", true);
    vfs = locals.vfs;
    userManager = locals.userManager;
    user = await userManager.addUser("bob", "12345678");
    admin = await userManager.addUser("alice", "12345678", "admin");

    sampleDocString = await fs.readFile(path.resolve(fixturesDir,"documents/01_simple.svx.json"), {encoding:"utf8"});
  });

  this.beforeEach(async function(){
    //Initialize a unique scene for each test
    titleSlug = this.currentTest?.title.replace(/[^\w]/g, "_").slice(0, 15)+"_"+randomBytes(4).toString("base64url");
    scene_id = await vfs.createScene(titleSlug, user.uid);
    sampleDoc = JSON.parse(sampleDocString);
    firstDocId = (await vfs.writeDoc(sampleDocString, {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"})).id;
  });



  it("can PUT a scene's document", async function(){
    sampleDoc.asset.copyright = "Something Else";
    await request(this.server).put(`/scenes/${titleSlug}/scene.svx.json`)
    .set("Authorization", await bearer("bob"))
    .set("Content-Type", "application/si-dpo-3d.document+json")
    .send(sampleDoc)
    .expect(204);

    let {ctime, mtime, size, data, id, ...doc} =  await vfs.getDoc(scene_id);
    expect(doc).to.deep.equal({
      name: 'scene.svx.json',
      author_id: user.uid,
      author: user.username,
      generation: 2,
      hash: "vpX0f_vG7OW_3GwXOPme_Cv2qNLoINjYdTX770KMdEg",
      mime: "application/si-dpo-3d.document+json",
    });
    expect(mtime).to.be.instanceof(Date);
    expect(ctime).to.be.instanceof(Date);
    expect(JSON.parse(data)).to.deep.equal(sampleDoc);
  });

  it("uses a merge algorithm when possible", async function(){
    //Insert a small change that happened between checkout and commit
    
    let currentDoc = JSON.parse(sampleDocString);
    currentDoc.models[0].annotations = [
      {id: uid(), title:"Annotation"}
    ];
    await vfs.writeDoc(JSON.stringify(currentDoc), {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});


    //Make our user reference the first doc generation
    sampleDoc.asset.id = firstDocId;
    sampleDoc.metas[0].collection.titles["FR"] = "Titre 1";
    //205: the stored document is a merge, not what was sent. The client must reload.
    let r = await request(this.server).put(`/scenes/${titleSlug}/scene.svx.json`)
    .set("Authorization", await bearer("bob"))
    .set("Content-Type", "application/si-dpo-3d.document+json")
    .send(sampleDoc)
    .expect(205);

    let {ctime, mtime, data:docString, id, ...doc} =  await vfs.getDoc(scene_id);
    const data = JSON.parse(docString);

    //This is some trivial reconciliation. See the merge module's tests for advanced cases.
    expect(data.models).to.have.length(1);
    expect(data.models[0], JSON.stringify(data.models[0])).to.have.property("annotations").to.have.length(1);
    expect(data.metas).to.have.length(1);
    expect(data.metas[0]?.collection?.titles["FR"], `From ${JSON.stringify(data.metas)}`).to.equal("Titre 1");
  });

  it("performs structured merge on the document", async function(){
    //This is a slightly less trivial case where we check if proper deduplication is applied
    //Insert a change that happened between checkout and commit
        
    let currentDoc = JSON.parse(sampleDocString);
    let idx = currentDoc.nodes.push({
      "id": "XFHQzCrGFKcc",
      "name": "Model 1",
      "model": 1,
    }) -1;
    currentDoc.scenes[0].nodes.push(idx);
    currentDoc.models.push({
      "units": "mm",
      "derivatives": [
        {
          "usage": "Web3D",
          "quality": "High",
          "assets": [{
              "uri": "models/model1.glb",
              "type": "Model",
            }
          ]
        }
      ]
    });

    await vfs.writeDoc(JSON.stringify(currentDoc), {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});

    //Make our user reference the first doc generation
    sampleDoc.asset.id = firstDocId;
    idx = sampleDoc.nodes.push({
      "id": "xpxZWrFw0Twi",
      "name": "Model 2",
      "model": 1,
    }) -1;
    sampleDoc.scenes[0].nodes.push(idx);
    sampleDoc.models.push({
      "units": "mm",
      "derivatives": [
        {
          "usage": "Web3D",
          "quality": "High",
          "assets": [{
              "uri": "models/model2.glb",
              "type": "Model",
            }
          ]
        }
      ]
    });
    let r = await request(this.server).put(`/scenes/${titleSlug}/scene.svx.json`)
    .set("Authorization", await bearer("bob"))
    .set("Content-Type", "application/si-dpo-3d.document+json")
    .send(sampleDoc)
    .expect(205);

    let {ctime, mtime, data:docString, id, ...doc} =  await vfs.getDoc(scene_id);
    const data = JSON.parse(docString);
    expect(data.models).to.have.length(3);
    expect(data.nodes).to.have.length(6);
  });

  it("records the merge, with its diff, in the task log", async function(){
    //The one thing worth knowing after the fact. It used to sit behind a condition
    //`writeDoc` can never satisfy, so no merge has ever been logged.
    let currentDoc = JSON.parse(sampleDocString);
    currentDoc.models[0].annotations = [{id: uid(), title:"Annotation"}];
    await vfs.writeDoc(JSON.stringify(currentDoc), {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});

    sampleDoc.asset.id = firstDocId;
    sampleDoc.metas[0].collection.titles["FR"] = "Titre 1";
    await request(this.server).put(`/scenes/${titleSlug}/scene.svx.json`)
    .set("Authorization", await bearer("bob"))
    .set("Content-Type", "application/si-dpo-3d.document+json")
    .send(sampleDoc)
    .expect(205);

    const logs = await vfs._db.all<{severity :string, message :string}>(
      `SELECT severity, message FROM tasks_logs ORDER BY log_id`
    );
    const messages = logs.filter(l=>l.severity === "info").map(l=>l.message);
    expect(messages.join("\n"), "the merge itself").to.match(/three-way merge: rebased #\d+ onto #\d+/);
    expect(messages.join("\n"), "and what it applied").to.contain('"Titre 1"');
  });

  it("answers 204 when nobody wrote in between", async function(){
    //Fast-forward: the reference is still the current document, so what gets stored is
    //exactly what was sent and the client has nothing to reload.
    sampleDoc.asset.id = firstDocId;
    sampleDoc.metas[0].collection.titles["FR"] = "Titre 1";
    await request(this.server).put(`/scenes/${titleSlug}/scene.svx.json`)
    .set("Authorization", await bearer("bob"))
    .set("Content-Type", "application/si-dpo-3d.document+json")
    .send(sampleDoc)
    .expect(204);

    const {data} = await vfs.getDoc(scene_id);
    delete sampleDoc.asset.id; //never stored
    expect(JSON.parse(data)).to.deep.equal(sampleDoc);
  });

  it("answers 204 when the document didn't change", async function(){
    sampleDoc.asset.id = firstDocId;
    await request(this.server).put(`/scenes/${titleSlug}/scene.svx.json`)
    .set("Authorization", await bearer("bob"))
    .set("Content-Type", "application/si-dpo-3d.document+json")
    .send(sampleDoc)
    .expect(204);

    expect((await vfs.getDoc(scene_id)).generation, "no new generation for a no-op").to.equal(1);
  });

  it("sets an ETag naming the document it wrote", async function(){
    //No reference id: the plain overwrite path, which merge-disabled instances always take.
    sampleDoc.asset.copyright = "Something Else";
    const res = await request(this.server).put(`/scenes/${titleSlug}/scene.svx.json`)
    .set("Authorization", await bearer("bob"))
    .set("Content-Type", "application/si-dpo-3d.document+json")
    .send(sampleDoc)
    .expect(204);

    const {id} = await vfs.getDoc(scene_id);
    expect(id).to.not.equal(firstDocId);
    expect(res.headers).to.have.property("etag", `"${id}"`);
  });

  it("sets an ETag on a fast-forward", async function(){
    sampleDoc.asset.id = firstDocId;
    sampleDoc.metas[0].collection.titles["FR"] = "Titre 1";
    const res = await request(this.server).put(`/scenes/${titleSlug}/scene.svx.json`)
    .set("Authorization", await bearer("bob"))
    .set("Content-Type", "application/si-dpo-3d.document+json")
    .send(sampleDoc)
    .expect(204);

    const {id} = await vfs.getDoc(scene_id);
    expect(res.headers).to.have.property("etag", `"${id}"`);
  });

  it("sets an ETag on a no-op, naming the document that is still current", async function(){
    sampleDoc.asset.id = firstDocId;
    const res = await request(this.server).put(`/scenes/${titleSlug}/scene.svx.json`)
    .set("Authorization", await bearer("bob"))
    .set("Content-Type", "application/si-dpo-3d.document+json")
    .send(sampleDoc)
    .expect(204);

    expect(res.headers).to.have.property("etag", `"${firstDocId}"`);
  });

  it("sets an ETag on a merge, naming the merged document", async function(){
    //This is what the client has to reload from, so it must be the same token a GET reports.
    let currentDoc = JSON.parse(sampleDocString);
    currentDoc.models[0].annotations = [{id: uid(), title:"Annotation"}];
    await vfs.writeDoc(JSON.stringify(currentDoc), {scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});

    sampleDoc.asset.id = firstDocId;
    sampleDoc.metas[0].collection.titles["FR"] = "Titre 1";
    const res = await request(this.server).put(`/scenes/${titleSlug}/scene.svx.json`)
    .set("Authorization", await bearer("bob"))
    .set("Content-Type", "application/si-dpo-3d.document+json")
    .send(sampleDoc)
    .expect(205);

    const get = await request(this.server).get(`/scenes/${titleSlug}/scene.svx.json`)
    .set("Authorization", await bearer("bob"))
    .expect(200);

    expect(res.headers.etag, "PUT and GET must agree").to.equal(get.headers.etag);
    expect(JSON.parse(get.text).asset.id, "and match what the body carries")
      .to.equal(parseInt(JSON.parse(res.headers.etag)));
  });

  it.skip("can't reference a foreign document to diff against", async function(){
    expect.fail("Unimplemented");
  });

});

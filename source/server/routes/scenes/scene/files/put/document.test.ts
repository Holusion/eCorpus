import fs from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

import request from "supertest";

import User from "../../../../../auth/User.js";
import UserManager from "../../../../../auth/UserManager.js";
import uid from "../../../../../utils/uid.js";
import Vfs from "../../../../../vfs/index.js";

import { fixturesDir } from "../../../../../__test_fixtures/fixtures.js";

describe("PUT /scenes/:scene/scene.svx.json", function(){
  
  let vfs :Vfs, userManager :UserManager, user :User, admin :User;
  let sampleDocString :string;
  let titleSlug :string, scene_id :number, sampleDoc :any;

  this.beforeAll(async function(){
    let locals = await createIntegrationContext(this, {enable_document_merge: true});
    vfs = locals.vfs;
    userManager = locals.userManager;
    user = await userManager.addUser("bob", "12345678");
    admin = await userManager.addUser("alice", "12345678", true);

    sampleDocString = await fs.readFile(path.resolve(fixturesDir,"documents/01_simple.svx.json"), {encoding:"utf8"});
  });
  this.afterAll(async function(){
    await cleanIntegrationContext(this);
  });

  this.beforeEach(async function(){
    //Initialize a unique scene for each test
    titleSlug = this.currentTest?.title.replace(/[^\w]/g, "_").slice(0, 15)+"_"+randomBytes(4).toString("base64url");
    scene_id = await vfs.createScene(titleSlug, user.uid);
    sampleDoc = JSON.parse(sampleDocString);
    await vfs.writeDoc(sampleDocString, scene_id, user.uid);
  });



  it("can PUT a scene's document", async function(){
    sampleDoc.asset.copyright = "Something Else";
    await request(this.server).put(`/scenes/${titleSlug}/scene.svx.json`)
    .auth("bob", "12345678")
    .set("Content-Type", "application/si-dpo-3d.document+json")
    .send(sampleDoc)
    .expect(204);

    let {ctime, mtime, size, data, id, ...doc} =  await vfs.getDoc(scene_id);
    console.log("Doc :", doc);
    expect(doc).to.deep.equal({
      name: 'scene.svx.json',
      author_id: user.uid,
      author: user.username,
      generation: 2
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
    await vfs.writeDoc(JSON.stringify(currentDoc), scene_id, user.uid);


    //Make our user reference the first doc generation
    sampleDoc.asset.id = 1;
    sampleDoc.metas[0].collection.titles["FR"] = "Titre 1";
    let r = await request(this.server).put(`/scenes/${titleSlug}/scene.svx.json`)
    .auth("bob", "12345678")
    .set("Content-Type", "application/si-dpo-3d.document+json")
    .send(sampleDoc)
    .expect(204);

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
    await vfs.writeDoc(JSON.stringify(currentDoc), scene_id, user.uid);


    //Make our user reference the first doc generation
    sampleDoc.asset.id = 1;
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
    .auth("bob", "12345678")
    .set("Content-Type", "application/si-dpo-3d.document+json")
    .send(sampleDoc)
    .expect(204);

    let {ctime, mtime, data:docString, id, ...doc} =  await vfs.getDoc(scene_id);
    const data = JSON.parse(docString);
    console.log("models : ", data.models);
    expect(data.models).to.have.length(3);
    expect(data.nodes).to.have.length(6);
  });

});

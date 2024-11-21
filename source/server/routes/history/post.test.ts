
import request from "supertest";
import Vfs from "../../vfs/index.js";
import User from "../../auth/User.js";
import UserManager from "../../auth/UserManager.js";
import { randomBytes } from "crypto";





describe("POST /history/:scene", function(){
  let vfs :Vfs, userManager :UserManager, user :User, admin :User;
  let titleSlug :string, scene_id :number;

  /**
   * antidate everything currently in the database to force proper ordering
   * Ensure rounding to the nearest second
   */
  async function antidate(t = Date.now()-10000){
    let ts = Math.round(t/1000);
    let d = new Date(ts*1000);
    await vfs._db.exec(`
      UPDATE scenes SET ctime = datetime("${d.toISOString()}") WHERE datetime("${d.toISOString()}") < ctime;
      UPDATE documents SET ctime = datetime("${d.toISOString()}")  WHERE datetime("${d.toISOString()}") < ctime;
      UPDATE files SET ctime = datetime("${d.toISOString()}")  WHERE datetime("${d.toISOString()}") < ctime;
    `);
  }

  this.beforeAll(async function(){
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager = locals.userManager;
    user = await userManager.addUser("bob", "12345678");
    admin = await userManager.addUser("alice", "12345678", true);
  });
  this.afterAll(async function(){
    await cleanIntegrationContext(this);
  });

  this.beforeEach(async function(){
    //Initialize a unique scene for each test
    titleSlug = this.currentTest?.title.replace(/[^\w]/g, "_").slice(0,15)+"_"+randomBytes(4).toString("base64url");
    scene_id = await vfs.createScene(titleSlug, user.uid);
  });

  it("restores a scene's document to a specific point in time", async function(){
    let ids :number[] = [];
    for(let i = 0; i < 5; i++){
      ids.push(await vfs.writeDoc(`{"id": ${i}}`, scene_id));
    }
    let point = ids[2];
    let expectedDoc = await vfs.getDocById(point);
    await antidate();

    let res = await request(this.server).post(`/history/${titleSlug}`)
    .auth("bob", "12345678")
    .set("Content-Type", "application/json")
    .send(expectedDoc)
    .expect("Content-Type", "application/json; charset=utf-8")
    .expect(200);
    expect(res.body).to.have.property("changes");
    expect(Object.keys(res.body.changes)).to.have.property("length", 1);

    let docs = await vfs.getDocHistory(scene_id);
    expect(docs).to.have.property("length", 6);
    let doc = docs[0];
    expect(doc).to.have.property("generation", 6);
    expect(doc).to.have.property("data", expectedDoc.data);
  });

  it("restores other files in the scene", async function(){
    await vfs.writeDoc(`{"id": 1}`, scene_id);
    await antidate(); //otherwise ordering of files of different names with the same timestamp is unclear
    let ref = await vfs.writeFile(dataStream(["hello"]), {mime: "text/html", name:"articles/hello.txt", scene: scene_id, user_id: user.uid });
    await vfs.writeDoc(`{"id": 2}`, scene_id);
    await vfs.writeFile(dataStream(["world"]), {mime: "text/html", name:"articles/hello.txt", scene: scene_id, user_id: user.uid });

    let res = await request(this.server).post(`/history/${titleSlug}`)
    .auth("bob", "12345678")
    .set("Content-Type", "application/json")
    .send({name: ref.name, generation: ref.generation })
    .expect("Content-Type", "application/json; charset=utf-8")
    .expect(200);
    expect(res.body).to.have.property("changes");
    expect(res.body.changes).to.deep.equal(["scene.svx.json", "articles/hello.txt"]);
    let doc = await vfs.getDoc(scene_id);
    expect(doc).to.have.property("data", `{"id": 1}`);
    expect(await vfs.getFileProps({name: "articles/hello.txt", scene: scene_id})).to.have.property("hash", ref.hash);
  });

  it("delete a file if needed", async function(){
    let id = await vfs.writeDoc(`{"id": 1}`, scene_id);
    await antidate();
    await vfs.writeFile(dataStream(["hello"]), {mime: "text/html", name:"articles/hello.txt", scene: scene_id, user_id: user.uid });
    let ref = await vfs.getDocById(id);
    
    let res = await request(this.server).post(`/history/${titleSlug}`)
    .auth("bob", "12345678")
    .set("Content-Type", "application/json")
    .send({...ref })
    .expect("Content-Type", "application/json; charset=utf-8")
    .expect(200);
    
    expect(res.body).to.have.property("changes");
    expect(res.body.changes).to.deep.equal(["articles/hello.txt"]);

    let doc = await vfs.getDoc(scene_id);
    expect(doc).to.deep.equal(ref);
    
    let allFiles = await vfs.listFiles(scene_id, true);
    expect(allFiles, JSON.stringify(allFiles, null, 2)).to.have.property("length", 1);
    expect(allFiles[0]).to.have.property("hash", null);
    expect(allFiles[0]).to.have.property("size", 0);
  });

  it("restore a file to deleted state", async function(){
    //This is not exactly the same as "delete a file if needed" because here the file has some previous history
    await vfs.writeDoc(`{"id": 1}`, scene_id);
    await antidate();
    await vfs.writeFile(dataStream(["hello"]), {mime: "text/html", name:"articles/hello.txt", scene: scene_id, user_id: user.uid });
    let refId = await  vfs.removeFile({mime: "text/html", name:"articles/hello.txt", scene: scene_id, user_id: user.uid });
    let ref = await vfs.getFileById(refId);
    await vfs.writeFile(dataStream(["world"]), {mime: "text/html", name:"articles/hello.txt", scene: scene_id, user_id: user.uid });

    let allFiles = await vfs.listFiles(scene_id, true);
    expect(allFiles).to.have.property("length", 1);
    expect(allFiles[0]).to.have.property("hash" ).ok;

    let res = await request(this.server).post(`/history/${titleSlug}`)
    .auth("bob", "12345678")
    .set("Content-Type", "application/json")
    .send({...ref })
    .expect("Content-Type", "application/json; charset=utf-8")
    .expect(200);
    expect(res.body).to.have.property("changes");
    expect(res.body.changes).to.deep.equal(['articles/hello.txt']);

    allFiles = await vfs.listFiles(scene_id, true);
    expect(allFiles).to.have.property("length", 1);
    expect(allFiles[0]).to.have.property("hash", null);
    expect(allFiles[0]).to.have.property("size", 0);
    expect(allFiles[0]).to.have.property("generation", 4);

  });

  it("undelete a file if needed", async function(){
    let now = Date.now();
    await vfs.writeDoc(`{"id": 1}`, scene_id);
    await antidate(now -10000);
    await vfs.writeFile(dataStream(["hello"]), {mime: "text/html", name:"articles/hello.txt", scene: scene_id, user_id: user.uid });
    await antidate(now -8000);
    let ref = await vfs.writeDoc(`{"id": 2}`, scene_id);
    await antidate(now -4000);
    await  vfs.removeFile({ name:"articles/hello.txt", scene: scene_id, user_id: user.uid });

    let doc = await vfs.getDocById(ref);

    let allFiles = await vfs.listFiles(scene_id, true);
    expect(allFiles).to.have.property("length", 1);
    expect(allFiles[0]).to.have.property("hash" ).not.ok;

    let res = await request(this.server).post(`/history/${titleSlug}`)
    .auth("bob", "12345678")
    .set("Content-Type", "application/json")
    .send({...doc })
    .expect("Content-Type", "application/json; charset=utf-8")
    .expect(200);
    expect(res.body).to.have.property("changes");
    
    expect(res.body.changes).to.deep.equal(['articles/hello.txt']);

    allFiles = await vfs.listFiles(scene_id, true);
    expect(allFiles).to.have.property("length", 1);
    expect(allFiles[0]).to.have.property("hash").to.equal("LPJNul-wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ");
    //console.log(allFiles[0]);
    expect(allFiles[0]).to.have.property("size").above(0);
    expect(allFiles[0]).to.have.property("generation", 3);
  });

  it("refuses to completely delete a document", async function(){
    let ref = await vfs.writeFile(dataStream(["hello"]), {mime: "text/html", name:"articles/hello.txt", scene: scene_id, user_id: user.uid });
    await antidate();
    await vfs.writeDoc(`{"id": 1}`, scene_id);

    let res = await request(this.server).post(`/history/${titleSlug}`)
    .auth("bob", "12345678")
    .set("Content-Type", "application/json")
    .send({name: "articles/hello.txt", generation: 1})
    .expect("Content-Type", "application/json; charset=utf-8")
    .expect(400);
    expect(res.text).to.match(/Trying to remove scene document for /);
    expect(await vfs.getDoc(scene_id)).to.have.property("data", `{"id": 1}`);
  });

  it("requires proper file identifier", async function(){
    let docId = await vfs.writeDoc(`{"id": 1}`, scene_id);
    let ref = await vfs.writeFile(dataStream(["hello"]), {mime: "text/html", name:"articles/hello.txt", scene: scene_id, user_id: user.uid });

    //no generation
    let res = await request(this.server).post(`/history/${titleSlug}`)
    .auth("bob", "12345678")
    .set("Content-Type", "application/json")
    .send({name: ref.name})
    .expect("Content-Type", "application/json; charset=utf-8")
    .expect(400);
    expect(res.text).to.match(/History restoration requires/);

    //no name
    res = await request(this.server).post(`/history/${titleSlug}`)
    .auth("bob", "12345678")
    .set("Content-Type", "application/json")
    .send({generation: 1})
    .expect("Content-Type", "application/json; charset=utf-8")
    .expect(400);
    expect(res.text).to.match(/History restoration requires/);

    //invalid generation name
    res = await request(this.server).post(`/history/${titleSlug}`)
    .auth("bob", "12345678")
    .set("Content-Type", "application/json")
    .send({name: ref.name, generation: ref.generation + 1})
    .expect("Content-Type", "application/json; charset=utf-8")
    .expect(400);
    expect(res.text).to.match(/No file found/);
  });


  describe("permissions", function(){
    let docId:number, body = {name: "scene.svx.json", generation: 1};
    this.beforeEach(async function(){
      docId = await vfs.writeDoc(`{"id": 1}`, scene_id);
      await vfs.writeDoc(`{"id": 2}`, scene_id);
    });
    it("requires admin rights over the scene", async function(){
      const oscar = await userManager.addUser("oscar", "12345678");
      //Fails with read-only
      await request(this.server).post(`/history/${titleSlug}`)
      .auth("oscar", "12345678")
      .set("Content-Type", "application/json")
      .send(body)
      .expect("Content-Type", "application/json; charset=utf-8")
      .expect(401);
      
      await userManager.grant(titleSlug, "oscar", "write");
      //Fails with write access
      await request(this.server).post(`/history/${titleSlug}`)
      .auth("oscar", "12345678")
      .set("Content-Type", "application/json")
      .send(body)
      .expect("Content-Type", "application/json; charset=utf-8")
      .expect(401);

            
      await userManager.grant(titleSlug, "oscar", "admin");
      //Succeeds with admin access
      await request(this.server).post(`/history/${titleSlug}`)
      .auth("oscar", "12345678")
      .set("Content-Type", "application/json")
      .send(body)
      .expect("Content-Type", "application/json; charset=utf-8")
      .expect(200);
    });

    it("admins can always restore scenes", async function(){
      await request(this.server).post(`/history/${titleSlug}`)
      .auth("alice", "12345678")
      .set("Content-Type", "application/json")
      .send(body)
      .expect("Content-Type", "application/json; charset=utf-8")
      .expect(200);
    });
  });
});

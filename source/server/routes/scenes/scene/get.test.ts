import request from "supertest";
import { expect } from "chai";
import yauzl, { Entry, ZipFile } from "yauzl";

import UserManager from "../../../auth/UserManager.js";
import Vfs from "../../../vfs/index.js";
import { once } from "events";


describe("GET /scenes/:scene", function(){
  let vfs:Vfs, userManager:UserManager, ids :number[];
  this.beforeEach(async function(){
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager  = locals.userManager;
    ids = await Promise.all([
        vfs.createScene("foo"),
        vfs.createScene("bar"),
    ]);
    await Promise.all(ids.map((id=>vfs.writeDoc("{}", {scene: id, user_id: null, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"}))));
    await Promise.all(ids.map(id=> vfs.writeFile(dataStream(), {scene:id, name:"articles/hello-world.html", mime: "text/html", user_id: null})))
  });
  this.afterEach(async function(){
    await cleanIntegrationContext(this);
  });
  describe("as application/json", function(){
    it("get scene info", async function(){
      await request(this.server).get("/scenes/foo")
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");
    });

    it("is access-protected (obfuscated as 404)", async function(){
      await userManager.setPublicAccess("foo", "none");
      await request(this.server).get("/scenes/foo")
      .expect(404);
    });

    it("Admin can access any scene", async function(){
      const adminUser = await userManager.addUser("adele","12345678","admin")
      await userManager.setPublicAccess("foo", "none");
      await userManager.setDefaultAccess("foo", "none");
      await request(this.server).get("/scenes/foo")
      .auth(adminUser.username, "12345678")
      .expect(200);
    });
  });

  describe("as application/zip", function(){
    let t = new Date("2023-05-03T13:34:26.000Z");
    this.beforeEach(async function(){
      await vfs._db.run(`UPDATE files SET ctime = '${t.toISOString()}'`);
    });
    it("download a zip file", async function(){
      let res = await request(this.server).get("/scenes/foo")
      .set("Accept", "application/zip")
      .responseType('blob')
      .expect(200)
      .expect("Content-Type", "application/zip");
      let b :Buffer = res.body;
      expect(Buffer.isBuffer(b)).to.be.true;
      expect(b).to.have.property("length").above(0);
    });
    describe("zip file validation", function(){
      let b :Buffer;
      this.beforeEach(async function(){
        let res = await request(this.server).get("/scenes/foo")
        .set("Accept", "application/zip")
        .responseType('blob')
        .expect(200)
        .expect("Content-Type", "application/zip");
        b  = res.body;
        expect(b).to.be.instanceof(Buffer);
        expect(b).to.have.property("length").above(0);
      });

      it("can parse its own zips", async function(){

        let zip = await new Promise<ZipFile>((resolve, reject)=>yauzl.fromBuffer(b, (err, zip)=>err?reject(err):resolve(zip)));
        let entries :Entry[]= [];
        zip.on("entry", (e)=>entries.push(e)); 
        await once(zip, "end");
        expect(entries.length ).to.equal(2);
      });
    })

    it("can use query params to set request format", async function(){
      let res = await request(this.server).get("/scenes/foo?format=zip")
      .responseType('blob')
      .expect(200)
      .expect("Content-Type", "application/zip");

      let b :Buffer = res.body;
      expect(Buffer.isBuffer(b)).to.be.true;

      //Verify zip is valid using unzip's check mode

    });

  });

});

import request from "supertest";
import { expect } from "chai";

import UserManager from "../../../auth/UserManager.js";
import { parse_file_header, read_cdh } from "../../../utils/zip/index.js";
import { HandleMock } from "../../../utils/zip/zip.test.js";
import Vfs from "../../../vfs/index.js";


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
    await Promise.all(ids.map((id=>vfs.writeDoc("{}", {scene: id, user_id: 0, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"}))));
    await Promise.all(ids.map(id=> vfs.writeFile(dataStream(), {scene:id, name:"articles/hello-world.html", mime: "text/html", user_id: 0})))
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
      await userManager.grant("foo", "default", "none");
      await request(this.server).get("/scenes/foo")
      .expect(404);
    });
  });

  describe("as application/zip", function(){
    let t = new Date("2023-05-03T13:34:26.000Z");
    this.beforeEach(async function(){
      await vfs._db.run(`UPDATE files SET ctime = datetime("${t.toISOString()}")`);
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
        let handle = HandleMock.Create(b);
        let headers_expected = [
          { filename: 'foo/', crc: 0,
            size: 0, compressedSize: 0,
            dosMode: 16, unixMode: 16893,
            offset: 0,
          },
          { filename: 'foo/articles/', crc: 0,
            size: 0, compressedSize: 0,
            dosMode: 16, unixMode: 16893,
            offset: 50,
          },
          {
            filename: 'foo/articles/hello-world.html', crc: 2117232040,
            size: 4, compressedSize: 4,
            dosMode: 0, unixMode: 65021,
            offset: 109, data: "foo\n",
          },
          {
            filename: 'foo/models/', crc: 0,
            size: 0, compressedSize: 0,
            dosMode: 16, unixMode: 16893,
            offset: 188
          },
          {
            filename: 'foo/scene.svx.json', crc: 2745614147,
            size: 2, compressedSize: 2,
            dosMode: 0, unixMode: 65021,
            offset: 245, data: "{}"
          }
        ];
  
        let index = 0;
        for await(let header of read_cdh(handle)){
          let exp = headers_expected[index];
          if(!exp) break;
  
          expect(header).to.have.property("filename", exp.filename);
          expect(header, `${header.filename} dosMode`).to.have.property("dosMode", exp.dosMode);
          //expect(header, `${header.filename} unixMode`).to.have.property("unixMode", exp.unixMode);
          expect(header, `${header.filename} extras`).to.have.property("extra", '');
          expect(header, `${header.filename} flags`).to.have.property("flags", 2056);
          expect(header, `${header.filename} mtime`).to.have.property("mtime").deep.equal(t);
  
          expect(header, `${header.filename} size`).to.have.property("size", exp.size);
          expect(header, `${header.filename} compressedSize`).to.have.property("compressedSize", exp.compressedSize);
          expect(header, `${header.filename} offset`).to.have.property("offset", exp.offset);
          let dataLength = 30 /* header length*/ + Buffer.byteLength(exp.filename) + exp.compressedSize;
          let next = headers_expected[index + 1];
          if(next){
            expect(header.offset + dataLength + 16, `Expect ${next.filename} to be just after data of ${header.filename}`).to.equal(next.offset);
          }
  
          let data = b.slice(exp.offset, exp.offset + dataLength);
          
          const fileHeader = parse_file_header(data.slice(0, 30 +Buffer.byteLength(exp.filename)));
          expect(fileHeader).to.have.property("filename", exp.filename);
          expect(fileHeader).to.have.property("mtime").deep.equal(t);
          expect(fileHeader).to.have.property("flags", 2056);
          expect(fileHeader).to.have.property("extra", "");
  
  
          if(exp.data){
            expect(data.slice(30, 30 + Buffer.byteLength(header.filename)).toString('utf-8')).to.equal(exp.filename);
            expect(data.slice(-header.compressedSize).toString("utf8"), `Actual data content:${data.toString("utf-8")}`).to.equal(exp.data);
          }
          expect(header, `${header.filename} crc`).to.have.property("crc", exp.crc);
          index++;
        }
  
        expect(index ,`Bad number of headers returned. Expected ${headers_expected.length} but index is ${index}`).to.equal(headers_expected.length);
  
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

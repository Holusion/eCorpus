import fs, { FileHandle } from "fs/promises";
import path from "path";
import {tmpdir} from "os";
import {Readable} from "stream";

import request from "supertest";
import { expect } from "chai";

import Vfs from "../../../../../vfs/index.js";
import UserManager from "../../../../../auth/UserManager.js";
import User from "../../../../../auth/User.js";
import { read_cdh } from "../../../../../utils/zip/index.js";

import { HandleMock } from "../../../../../utils/zip/zip.test.js";

describe("GET /api/v1/scenes/:scene", function(){
  let vfs:Vfs, userManager:UserManager, ids :number[];
  this.beforeEach(async function(){
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager  = locals.userManager;
    ids = await Promise.all([
        vfs.createScene("foo"),
        vfs.createScene("bar"),
    ]);
    await Promise.all(ids.map((id=>vfs.writeDoc("{}", id))));
    await Promise.all(ids.map(id=> vfs.writeFile(dataStream(), {scene:id, name:"articles/hello-world.html", mime: "text/html", user_id: 0})))
  });
  this.afterEach(async function(){
    await cleanIntegrationContext(this);
  });
  describe("as application/json", function(){
    it("get scene info", async function(){
      await request(this.server).get("/api/v1/scenes/foo")
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");
    });

    it("is access-protected (obfuscated as 404)", async function(){
      await userManager.grant("foo", "default", "none");
      await request(this.server).get("/api/v1/scenes/foo")
      .expect(404);
    });
  });

  describe("as application/zip", function(){
    it("download a zip file", async function(){
      let t = new Date("2023-05-03T13:34:26.000Z");
      await vfs._db.run(`UPDATE files SET ctime = datetime("${t.toISOString()}")`);
      await vfs._db.run(`UPDATE documents SET ctime = datetime("${t.toISOString()}")`);

      let res = await request(this.server).get("/api/v1/scenes/foo")
      .set("Accept", "application/zip")
      .expect(200)
      .expect("Content-Type", "application/zip");
      let b :any = Buffer.from(res.text, "binary");
      expect(b).to.have.property("length").above(0);
      let handle = HandleMock.Create(b);
      let headers = [];
      for await(let header of read_cdh(handle)){
        headers.push(header);
      }
      expect(headers).to.deep.equal([
        {
          filename: 'foo/',
          crc: 0,
          size: 0,
          compressedSize: 0,
          dosMode: 16,
          unixMode: 16893,
          offset: 0,
        },
        {
          filename: 'foo/articles/',
          crc: 0,
          size: 0,
          compressedSize: 0,
          dosMode: 16,
          unixMode: 16893,
          offset: 50,
        },
        {
          filename: 'foo/articles/hello-world.html',
          crc: 2117232125,
          size: 4,
          compressedSize: 4,
          dosMode: 0,
          unixMode: 65021,
          offset: 109,
        },
        {
          filename: 'foo/models/',
          crc: 0,
          size: 0,
          compressedSize: 0,
          dosMode: 16,
          unixMode: 16893,
          offset: 253
        },
        {
          filename: 'foo/scene.svx.json',
          crc: 4261281091,
          size: 2,
          compressedSize: 2,
          dosMode: 0,
          unixMode: 65021,
          offset: 253
        }
      ].map(h =>({
        ...h, 
        extra:'', flags: 2056, mtime: new Date("2023-07-29T13:34:26.000Z"),
        
      })));
    });

    it("can use query params to set request format", async function(){
      await request(this.server).get("/api/v1/scenes/foo?format=zip")
      .expect(200)
      .expect("Content-Type", "application/zip");
    });

  });

});

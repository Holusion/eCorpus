import fs, { FileHandle } from "fs/promises";
import path from "path";
import {tmpdir} from "os";
import {Readable} from "stream";

import request from "supertest";
import { expect } from "chai";

import Vfs from "../../../../../vfs";
import UserManager from "../../../../../auth/UserManager";
import User from "../../../../../auth/User";
import { read_cdh } from "../../../../../utils/zip";

import { HandleMock } from "../../../../../utils/zip/zip.test";

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

    it("is access-protected", async function(){
      await userManager.grant("foo", "default", "none");
      await request(this.server).get("/api/v1/scenes/foo")
      .expect(401);
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
          filename: 'foo',
          crc: 0,
          size: 0,
          mtime: new Date("2023-07-29T13:34:26.000Z"),
          dosMode: 16,
          unixMode: 16893,
          offset: 0,
          length: 49
        },
        {
          filename: 'foo/articles',
          crc: 0,
          size: 0,
          mtime: new Date("2023-07-29T13:34:26.000Z"),
          dosMode: 16,
          unixMode: 16893,
          offset: 49,
          length: 58
        },
        {
          filename: 'foo/articles/hello-world.html',
          crc: 2117232125,
          size: 4,
          mtime: new Date("2023-07-29T13:34:26.000Z"),
          dosMode: 0,
          unixMode: 65021,
          offset: 107,
          length: 75
        },
        {
          filename: 'foo/models',
          crc: 0,
          size: 0,
          mtime: new Date("2023-07-29T13:34:26.000Z"),
          dosMode: 16,
          unixMode: 16893,
          offset: 253,
          length: 56
        },
        {
          filename: 'foo/scene.svx.json',
          crc: 4261281091,
          size: 2,
          mtime: new Date("2023-07-29T13:34:26.000Z"),
          dosMode: 0,
          unixMode: 65021,
          offset: 253,
          length: 64
        }
      ].map(h =>({...h, extra:'', flags: 2056 })));
    });

    it("can use query params to set request format", async function(){
      await request(this.server).get("/api/v1/scenes/foo?format=zip")
      .expect(200)
      .expect("Content-Type", "application/zip");
    });

  });

});

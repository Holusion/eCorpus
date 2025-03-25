import express from "express";
import { compressedMime, getContentType, getMimeType } from "./filetypes.js";
import request from "supertest";


describe("getMimeType",function(){
  //Check proper operation of mimetype guessing function
  //This is mostly out of our hands, but if types we tend to rely on do change, we want to know!
  it("lookups svx files", function(){
    expect(getMimeType("foo.svx.json")).to.equal("application/si-dpo-3d.document+json");
    expect(getMimeType("/path/to/scene.svx.json")).to.equal("application/si-dpo-3d.document+json");
  });

  it("model/gltf-binary", function(){
    expect(getMimeType("foo.glb")).to.equal("model/gltf-binary");
  });

  it("text/html", function(){
    expect(getMimeType("foo.html")).to.equal("text/html");
  });

  it("defaults to application/octet-stream", function(){
    expect(getMimeType("foo.bar")).to.equal("application/octet-stream");
  })
});

describe("getContentType", function(){
  //Wraps around getMimeType to try to force the content type from request's headers.
  let app = express();
  app.put("/:file", (req, res)=>{
    res.set("Content-Type", getContentType(req)).status(204).end();
  });

  it("infer .svx.json", async function(){
    await request(app).put("/foo.svx.json")
    .expect(204)
    .expect("Content-Type", "application/si-dpo-3d.document+json");
  });

  it("infer model/gltf-binary", async function(){
    await request(app).put("/foo.glb")
    .expect(204)
    .expect("Content-Type", "model/gltf-binary");
  });

  it("infer html", async function(){
    await request(app).put("/foo.html")
    .expect(204)
    .expect("Content-Type", "text/html; charset=utf-8");
  });

  it("ignores Content-Type header if it can", async function(){
    //DPO-Voyager sets article's content-type to text/plain, we don't want that.
    await request(app).put("/foo.html")
    .set("Content-Type", "text/plain")
    .expect(204)
    .expect("Content-Type", "text/html; charset=utf-8");
  });

  it("can be hinted", async function(){
    await request(app).put("/foo")
    .set("Content-Type", "text/html")
    .expect(204)
    .expect("Content-Type", "text/html; charset=utf-8");
  });

  it("defaults to application/octet-stream", async function(){
    await request(app).put("/foo")
    .expect(204)
    .expect("Content-Type", "application/octet-stream");
  });
});

describe("compressedMime", function(){
  [
    "image/jpeg",
    "image/png",
    "video/mp4",
    "application/zip",
  ].forEach((t)=>{
    it(`${t}: false`, function(){
      expect(compressedMime(t)).to.be.false;
    });
  });
  
  [
    "image/tiff",
    "image/svg+xml",
    "application/xml+svg",
    "text/html",
  ].forEach((t)=>{
    it(`${t}: true`, function(){
      expect(compressedMime(t)).to.be.true;
    });
  });
});
import express from "express";
import { compressedMime, getContentType, getMimeType, parseMagicBytes } from "./filetypes.js";
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


describe("extFromType()", function(){
  
});

describe("parseMagicBytes()", function(){
  //Header of a 1156x420 png
  //Header of a 1067x800 jpeg
  it("image/png", function(){
    expect(parseMagicBytes(Buffer.from('89504e470d0a1a0a', "hex"))).to.equal("image/png");
  });

  it("image/jpeg", function(){
    [
      "FFD8FFDB", //Raw jpeg
      "FFD8FFE000104A4649460001", //JFIF
      "FFD8FFEE", //Also jpeg
      "FFD8FFE0", // still jpeg
    ].forEach((str)=>{
      expect(parseMagicBytes(Buffer.from(str, "hex")), `0x${str} should be a valid jpeg header`).to.equal("image/jpeg")
    })
  });
  it("image/webp", function(){
    //Header with a size of 0
    expect(parseMagicBytes(Buffer.from('524946460000000057454250', 'hex'))).to.equal("image/webp");
    //header with a real size
    expect(parseMagicBytes(Buffer.from('52494646b254000057454250', 'hex'))).to.equal("image/webp");
    //header from another RIFF container
    expect(parseMagicBytes(Buffer.from('524946460000000057415645', 'hex'))).to.equal("application/octet-stream");
  });

  it("model/gltf-binary", function(){
    // See https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#binary-header
    const b= Buffer.alloc(4);
    b.writeUint32LE(0x676C5446);
    expect(parseMagicBytes(b)).to.equal("model/gltf-binary");
    
    expect(parseMagicBytes(Buffer.from("46546c67", "hex"))).to.equal("model/gltf-binary");

  });


})
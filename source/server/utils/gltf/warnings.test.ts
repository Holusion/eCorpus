import { Document } from "@gltf-transform/core";
import sharp from "sharp";
import { getModelWarnings, LARGE_TEXTURE_SIZE } from "./warnings.js";

describe("getModelWarnings()", function() {
  async function addTexture(document: Document, format: "png" | "jpeg", width: number, height = 1) {
    const image = await sharp({ create: { width, height, channels: 3, background: "white" } })
      .toFormat(format).toBuffer();
    return document.createTexture().setMimeType(`image/${format}`).setImage(image);
  }

  it("reports PNGs and oversized textures once each, including non-diffuse textures", async function() {
    const document = new Document();
    await addTexture(document, "png", LARGE_TEXTURE_SIZE + 1);
    await addTexture(document, "png", 1);
    const warnings = getModelWarnings(document);
    expect(warnings).to.deep.equal(["png-images", "large-textures"]);
  });

  it("reports oversized JPEG textures without a PNG warning", async function() {
    const document = new Document();
    await addTexture(document, "jpeg", LARGE_TEXTURE_SIZE + 1);
    expect(getModelWarnings(document)).to.deep.equal(["large-textures"]);
  });

  it("accepts textures at the optimization limit and models without textures", async function() {
    const document = new Document();
    expect(getModelWarnings(document)).to.deep.equal([]);
    await addTexture(document, "jpeg", LARGE_TEXTURE_SIZE);
    expect(getModelWarnings(document)).to.deep.equal([]);
  });

  for (const height of [2047, 2048, 2049]) {
    it(`checks the combined diffuse pixel area for two 4096×${height} maps`, async function() {
      const document = new Document();
      for (let i = 0; i < 2; i++) {
        const texture = await addTexture(document, "jpeg", LARGE_TEXTURE_SIZE, height);
        document.createMaterial().setBaseColorTexture(texture);
      }
      const warnings = getModelWarnings(document);
      expect(warnings).to.deep.equal(height > 2048 ? ["large-combined-diffuse-maps"] : []);
    });
  }

  it("counts a diffuse map shared by multiple materials only once", async function() {
    const document = new Document();
    const shared = await addTexture(document, "jpeg", LARGE_TEXTURE_SIZE, 2049);
    document.createMaterial().setBaseColorTexture(shared);
    document.createMaterial().setBaseColorTexture(shared);
    const small = await addTexture(document, "jpeg", 1);
    document.createMaterial().setBaseColorTexture(small);
    expect(getModelWarnings(document)).to.deep.equal([]);
  });

  it("excludes normal maps from the combined diffuse area", async function() {
    const document = new Document();
    const diffuse = await addTexture(document, "jpeg", LARGE_TEXTURE_SIZE, LARGE_TEXTURE_SIZE / 2);
    const secondDiffuse = await addTexture(document, "jpeg", LARGE_TEXTURE_SIZE, LARGE_TEXTURE_SIZE / 2);
    const normal = await addTexture(document, "jpeg", LARGE_TEXTURE_SIZE, 1);
    document.createMaterial().setBaseColorTexture(diffuse).setNormalTexture(normal);
    document.createMaterial().setBaseColorTexture(secondDiffuse);
    expect(getModelWarnings(document)).to.deep.equal([]);
  });

  it("requires more than one diffuse map even when a single map exceeds the area limit", async function() {
    const document = new Document();
    const texture = await addTexture(document, "jpeg", LARGE_TEXTURE_SIZE + 1, LARGE_TEXTURE_SIZE);
    document.createMaterial().setBaseColorTexture(texture);
    expect(getModelWarnings(document)).to.deep.equal(["large-textures"]);
  });
});

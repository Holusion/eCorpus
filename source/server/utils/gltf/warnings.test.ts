import type { MeshtinkerImage } from "../meshtinker.js";
import { getModelWarnings, LARGE_TEXTURE_SIZE, localizeModelWarnings, ModelWarning } from "./warnings.js";
import { Localized } from "../i18n.js";

describe("getModelWarnings()", function() {
  /** Images of a `meshtinker inspect` report */
  function report(...images: Array<Partial<MeshtinkerImage>>): {images: MeshtinkerImage[]} {
    return {
      images: images.map((image, index) => ({
        index, name: null, file: null, mimeType: "image/jpeg", width: 1, height: 1, byteSize: 1, uses: [], occupancy: null,
        ...image,
      })),
    };
  }
  /** Uses of an image as the base color of materials */
  const diffuse = (...materials: number[]) => materials.map(material => ({ material, slot: "baseColorTexture", texture: material }));

  it("reports PNGs and oversized textures once each, including non-diffuse textures", function() {
    const warnings = getModelWarnings(report(
      { mimeType: "image/png", width: LARGE_TEXTURE_SIZE + 1 },
      { mimeType: "image/png" },
    ));
    expect(warnings).to.deep.equal(["png-images", "large-textures"]);
  });

  it("reports oversized JPEG textures without a PNG warning", function() {
    expect(getModelWarnings(report({ width: LARGE_TEXTURE_SIZE + 1 }))).to.deep.equal(["large-textures"]);
  });

  it("accepts textures at the optimization limit and models without textures", function() {
    expect(getModelWarnings(report())).to.deep.equal([]);
    expect(getModelWarnings(report({ width: LARGE_TEXTURE_SIZE }))).to.deep.equal([]);
  });

  it("ignores sizes that couldn't be read", function() {
    expect(getModelWarnings(report({ mimeType: null, width: null, height: null }))).to.deep.equal([]);
  });

  for (const height of [2047, 2048, 2049]) {
    it(`checks the combined diffuse pixel area for two 4096×${height} maps`, function() {
      const warnings = getModelWarnings(report(
        { width: LARGE_TEXTURE_SIZE, height, uses: diffuse(0) },
        { width: LARGE_TEXTURE_SIZE, height, uses: diffuse(1) },
      ));
      expect(warnings).to.deep.equal(height > 2048 ? ["large-combined-diffuse-maps"] : []);
    });
  }

  it("counts a diffuse map shared by multiple materials only once", function() {
    expect(getModelWarnings(report(
      { width: LARGE_TEXTURE_SIZE, height: 2049, uses: diffuse(0, 1) },
      { uses: diffuse(2) },
    ))).to.deep.equal([]);
  });

  it("excludes normal maps from the combined diffuse area", function() {
    expect(getModelWarnings(report(
      { width: LARGE_TEXTURE_SIZE, height: LARGE_TEXTURE_SIZE / 2, uses: diffuse(0) },
      { width: LARGE_TEXTURE_SIZE, height: LARGE_TEXTURE_SIZE / 2, uses: diffuse(1) },
      { width: LARGE_TEXTURE_SIZE, height: 1, uses: [{ material: 0, slot: "normalTexture", texture: 2 }] },
    ))).to.deep.equal([]);
  });

  it("requires more than one diffuse map even when a single map exceeds the area limit", function() {
    expect(getModelWarnings(report(
      { width: LARGE_TEXTURE_SIZE + 1, height: LARGE_TEXTURE_SIZE, uses: diffuse(0) },
    ))).to.deep.equal(["large-textures"]);
  });
});

describe("localizeModelWarnings()", function() {
  const all: ModelWarning[] = ["png-images", "large-textures", "large-combined-diffuse-maps"];

  it("reports each warning and gives each piece of advice once", function() {
    expect(localizeModelWarnings(["png-images", "large-textures"])).to.deep.equal({
      warnings: [
        { key: "modelWarnings.png-images", params: {} },
        { key: "modelWarnings.large-textures", params: {} },
      ],
      messages: [{ key: "modelWarnings.recommend-optimize", params: {} }],
    });
  });

  it("reports nothing without warnings", function() {
    expect(localizeModelWarnings([])).to.deep.equal({ warnings: [], messages: [] });
  });

  it("has english and french translations for every warning and advice", function() {
    const { warnings, messages } = localizeModelWarnings(all);
    for (const { key } of [...warnings, ...messages]) {
      const en = new Localized(key).translate("en");
      expect(en, key).not.to.equal(key);
      // A missing french translation would fall back to english
      expect(new Localized(key).translate("fr"), key).not.to.equal(en);
    }
  });
});

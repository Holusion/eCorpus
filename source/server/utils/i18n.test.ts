import { expect } from "chai";
import { localize, Localized, translateErrorMessage, translateTaskOutput } from "./i18n.js";
import { BadRequestError, HTTPError } from "./errors.js";
import { parseTaskError, serializeTaskError } from "../tasks/errors.js";


describe("localize()", function(){
  const msg = () => localize("errors.upload.notGlb", { filename: "foo.glb" });

  it("translates to the requested language", function(){
    expect(msg().translate("fr")).to.equal("foo.glb ne semble pas être un fichier GLB");
  });

  it("renders as english when used as a string", function(){
    expect(`${msg()}`).to.equal("foo.glb does not look like a GLB file");
    expect(JSON.stringify({ message: msg() })).to.equal(`{"message":"foo.glb does not look like a GLB file"}`);
  });

  it("falls back to english for unsupported languages", function(){
    expect(msg().translate("de")).to.equal("foo.glb does not look like a GLB file");
  });

  describe("in errors", function(){
    it("keeps an english message", function(){
      const e = new BadRequestError(msg());
      expect(e.message).to.equal("[400] foo.glb does not look like a GLB file");
      expect(e.i18n).to.deep.equal({ key: "errors.upload.notGlb", params: { filename: "foo.glb" } });
    });

    it("survives task output serialization", function(){
      const e = parseTaskError(JSON.parse(serializeTaskError(new BadRequestError(msg())))) as HTTPError;
      expect(e).to.have.property("i18n");
      expect(new Localized(e.i18n!.key, e.i18n!.params).translate("fr")).to.equal("foo.glb ne semble pas être un fichier GLB");
    });

    it("doesn't set i18n for plain strings", function(){
      expect(new BadRequestError("foo")).not.to.have.property("i18n");
    });
  });
});


describe("translateTaskOutput()", function(){
  const notGlb = () => localize("errors.upload.notGlb", { filename: "foo.glb" });

  it("returns outputs without localized keys as-is", function(){
    for(const output of [null, 42, "foo", ["a"], { scenes: ["foo"] }]){
      expect(translateTaskOutput("success", output, "fr")).to.equal(output);
    }
  });

  it("adds a message to localized entries of warnings and messages", function(){
    const output = { mime: "model/gltf-binary", warnings: [notGlb().toData()], messages: [notGlb().toData()] };
    const translated = translateTaskOutput("success", output, "fr");
    const entry = { key: "errors.upload.notGlb", params: { filename: "foo.glb" }, message: "foo.glb ne semble pas être un fichier GLB" };
    expect(translated).to.deep.equal({ mime: "model/gltf-binary", warnings: [entry], messages: [entry] });
    expect(output.warnings[0]).not.to.have.property("message");
  });

  it("leaves other entries and keys alone", function(){
    const nested = { warnings: [notGlb().toData()] };
    const output = { warnings: ["png-images", { code: 1 }], nested };
    expect(translateTaskOutput("success", output, "fr")).to.deep.equal({ warnings: ["png-images", { code: 1 }], nested });
  });

  it("translates serialized errors of failed tasks", function(){
    const output = JSON.parse(serializeTaskError(new BadRequestError(notGlb())));
    expect(translateTaskOutput("error", output, "fr")).to.have.property("message", "[400] foo.glb ne semble pas être un fichier GLB");
    expect(translateTaskOutput("error", { message: "plain" }, "fr")).to.deep.equal({ message: "plain" });
  });

  it("doesn't translate errors of successful tasks", function(){
    const output = JSON.parse(serializeTaskError(new BadRequestError(notGlb())));
    expect(translateTaskOutput("success", output, "fr")).to.equal(output);
  });
});

describe("translateErrorMessage()", function(){
  it("keeps messages of non-localized errors", function(){
    expect(translateErrorMessage({ message: "[400] foo" }, "fr")).to.equal("[400] foo");
  });

  it("only prefixes a numeric code", function(){
    const i18n = { key: "errors.upload.notGlb", params: { filename: "foo.glb" } };
    expect(translateErrorMessage({ message: "", i18n }, "fr")).to.equal("foo.glb ne semble pas être un fichier GLB");
    expect(translateErrorMessage({ message: "", code: 404, i18n }, "fr")).to.equal("[404] foo.glb ne semble pas être un fichier GLB");
  });
});

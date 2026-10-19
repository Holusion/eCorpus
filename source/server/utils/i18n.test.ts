import { expect } from "chai";
import { localize, Localized } from "./i18n.js";
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

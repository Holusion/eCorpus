import { expect } from "chai";
import type { Request, Response } from "express";
import type { TaskDefinition, TaskNode } from "../tasks/types.js";
import { localize, Localized, translateErrorMessage, translateTask, translateTaskOutput } from "./i18n.js";
import { BadRequestError, HTTPError } from "./errors.js";
import * as errors from "./errors.js";
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

describe("translateTask()", function(){
  const req = { session: { lang: "fr" } } as unknown as Request;
  let headers: Record<string, string>;
  let res: Response;

  this.beforeEach(function(){
    headers = {};
    res = {
      vary: (field: string) => { headers.Vary = field; },
      set: (field: string, value: string) => { headers[field] = value; },
    } as Response;
  });

  function task(output: unknown, status: TaskDefinition["status"] = "success"): TaskDefinition {
    return { task_id: 1, scene_id: null, user_id: null, ctime: new Date(), type: "test", parent: null, after: [], data: {}, output, status };
  }

  it("translates a failed task without changing its stored output", function(){
    const original = task(JSON.parse(serializeTaskError(new BadRequestError(localize("errors.upload.notGlb", { filename: "foo.glb" })))), "error");
    const translated = translateTask(req, res, original);
    expect(translated.output.message).to.equal("[400] foo.glb ne semble pas être un fichier GLB");
    expect(original.output.message).to.equal("[400] foo.glb does not look like a GLB file");
    expect(translated).not.to.have.property("children");
    expect(headers).to.deep.equal({ Vary: "Accept-Language", "Content-Language": "fr" });
  });

  it("translates descendants and sets Content-Language when only a descendant is localized", function(){
    const leaf: TaskNode = { ...task({ warnings: [localize("errors.upload.notGlb", { filename: "foo.glb" }).toData()] }), children: [] };
    const original: TaskNode = { ...task(null), children: [{ ...task(null), children: [leaf] }] };
    const translated = translateTask(req, res, original);
    expect(translated.children[0].children[0].output.warnings[0].message).to.equal("foo.glb ne semble pas être un fichier GLB");
    expect(leaf.output.warnings[0]).not.to.have.property("message");
    expect(translated.children[0].children[0].children).to.deep.equal([]);
    expect(headers).to.deep.equal({ Vary: "Accept-Language", "Content-Language": "fr" });
  });

  it("preserves unlocalized task data without setting Content-Language", function(){
    const original: TaskNode = { ...task({ scenes: ["foo"] }), children: [{ ...task(null), children: [] }] };
    expect(translateTask(req, res, original)).to.deep.equal(original);
    expect(headers).to.deep.equal({ Vary: "Accept-Language" });
  });
});

describe("translateErrorMessage()", function(){
  for(const [Constructor, code, english, french] of [
    [errors.BadRequestError, 400, "Bad Request", "Requête incorrecte"],
    [errors.UnauthorizedError, 401, "Unauthorized", "Non autorisé"],
    [errors.ForbiddenError, 403, "Forbidden", "Accès interdit"],
    [errors.NotFoundError, 404, "Not Found", "Introuvable"],
    [errors.MethodNotAllowedError, 405, "Method Not Allowed", "Méthode non autorisée"],
    [errors.ConflictError, 409, "Conflict", "Conflit"],
    [errors.LengthRequiredError, 411, "Length Required", "Longueur requise"],
    [errors.PreconditionFailedError, 412, "Precondition Failed", "Précondition non satisfaite"],
    [errors.RangeNotSatisfiableError, 416, "Range Not Satisfiable", "Plage demandée non satisfaisable"],
    [errors.InternalError, 500, "Internal Server Error", "Erreur interne du serveur"],
    [errors.NotImplementedError, 501, "Not Implemented", "Non implémenté"],
  ] as const){
    it(`translates the default ${Constructor.name} while keeping its stored message in English`, function(){
      const error = new Constructor();
      expect(error.code).to.equal(code);
      expect(translateErrorMessage(error, "fr")).to.equal(`[${code}] ${french}`);
      expect(translateErrorMessage(error, "en")).to.equal(`[${code}] ${english}`);
      expect(error.message).to.equal(`[${code}] ${english}`);
    });
  }

  it("keeps messages of non-localized errors", function(){
    expect(translateErrorMessage({ message: "[400] foo" }, "fr")).to.equal("[400] foo");
  });

  it("only prefixes a numeric code", function(){
    const i18n = { key: "errors.upload.notGlb", params: { filename: "foo.glb" } };
    expect(translateErrorMessage({ message: "", i18n }, "fr")).to.equal("foo.glb ne semble pas être un fichier GLB");
    expect(translateErrorMessage({ message: "", code: 404, i18n }, "fr")).to.equal("[404] foo.glb ne semble pas être un fichier GLB");
  });
});

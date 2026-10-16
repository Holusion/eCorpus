import { apiMessage, formatMessage } from "./index.js";
import { english, french } from "./catalogue.js";
import { BadRequestError } from "../errors.js";
import { parseTaskError, serializeTaskError } from "../../tasks/errors.js";

function parameters(text: string): string[] {
  return [...new Set([...text.matchAll(/{{\s*([\w.]+)\s*}}/g)].map(match => match[1]))].sort();
}

describe("API message catalogue", function() {
  it("has nonempty English text for every registered message", function() {
    for (const [code, text] of Object.entries(english)) {
      expect(text, code).to.be.a("string").and.not.to.equal("");
      expect(text.trim(), code).not.to.equal("");
    }
  });

  it("has an English source and matching parameters for every French entry", function() {
    for (const [code, text] of Object.entries(french)) {
      expect(Object.hasOwn(english, code), code).to.equal(true);
      expect(text.trim(), code).not.to.equal("");
      expect(parameters(text), code).to.deep.equal(parameters(english[code]));
    }
  });
});

describe("API messages", function() {
  it("interpolates each language without mutating a global locale", function() {
    const message = apiMessage("tasks.unsupported-type", { type: "mesh" });
    expect(formatMessage(message)).to.equal("Unsupported task type: mesh");
    expect(formatMessage(message, "fr")).to.equal("Type de tâche non pris en charge : mesh");
    expect(formatMessage(message)).to.equal("Unsupported task type: mesh");
    expect(formatMessage(message, "cimode")).to.equal("tasks.unsupported-type");
  });

  it("falls back to English when the French entry is missing or empty", function() {
    const key = "http.conflict";
    const saved = french[key];
    try {
      delete french[key];
      expect(formatMessage(apiMessage(key), "fr")).to.equal(english[key]);
      french[key] = "";
      expect(formatMessage(apiMessage(key), "fr")).to.equal(english[key]);
    } finally { french[key] = saved; }
  });

  it("fails loudly for missing English, even if French exists", function() {
    const code = "test.missing-english";
    french[code] = "Une traduction";
    try {
      expect(() => apiMessage(code)).to.throw(`Missing English API message: ${code}`);
      expect(() => formatMessage({ messageCode: code, messageParams: {} }, "fr"))
        .to.throw(`Missing English API message: ${code}`);
    } finally { delete french[code]; }
  });

  it("rejects empty English entries", function() {
    const key = "http.conflict";
    const saved = english[key];
    try {
      english[key] = "  ";
      expect(() => apiMessage(key)).to.throw(`Missing English API message: ${key}`);
    } finally { english[key] = saved; }
  });

  it("keeps English diagnostics and message references through task serialization", function() {
    const error = new BadRequestError(apiMessage("tasks.unsupported-type", { type: "mesh" }));
    const restored = parseTaskError(JSON.parse(serializeTaskError(error))) as BadRequestError;
    expect(restored.message).to.equal("[400] Unsupported task type: mesh");
    expect(restored.messageCode).to.equal("tasks.unsupported-type");
    expect(restored.messageParams).to.deep.equal({ type: "mesh" });
    expect(new BadRequestError("legacy message").message).to.equal("[400] legacy message");
  });
});

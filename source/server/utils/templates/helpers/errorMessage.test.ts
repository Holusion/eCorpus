import { errorMessage } from "./errorMessage.js";
import { BadRequestError } from "../../errors.js";
import { serializeTaskError } from "../../../tasks/errors.js";

const options = (lang?: string) => ({ data: { root: { lang } } });

describe("errorMessage helper", function () {
  it("gives the message of a failed task's output", function () {
    const output = JSON.parse(serializeTaskError(new Error("Task failed")));
    expect(errorMessage.call({}, output, options("en"))).to.equal("Task failed");
  });

  it("translates it to the language of the page", function () {
    const output = JSON.parse(serializeTaskError(new BadRequestError()));
    expect(errorMessage.call({}, output, options("fr"))).to.equal("Requête incorrecte");
    expect(errorMessage.call({}, output, options("en"))).to.equal("Bad Request");
  });

  it("is in English when the page has no language", function () {
    const output = JSON.parse(serializeTaskError(new BadRequestError()));
    expect(errorMessage.call({}, output, options())).to.equal("Bad Request");
  });

  it("is empty when there's no message", function () {
    for (const output of [null, undefined, "foo", 12, {}, { message: 12 }, ["foo"]]) {
      expect(errorMessage.call({}, output, options("en")), JSON.stringify(output)).to.equal("");
    }
  });
});

import { join } from "./join.js";

function call(...args: any[]): string {
  return join.call({}, ...args, { hash: {} });
}

function callSep(separator: string, ...args: any[]): string {
  return join.call({}, ...args, { hash: { separator } });
}

describe("join helper", function () {
  it("concatenates strings", function () {
    expect(call("hello", "/world")).to.equal("hello/world");
    expect(call("a", "b", "c")).to.equal("abc");
  });

  it("flattens arrays", function () {
    expect(call(["a", "b", "c"])).to.equal("abc");
    expect(call("x", ["y", "z"])).to.equal("xyz");
  });

  it("stringifies null", function () {
    expect(call("a", null)).to.equal("anull");
  });

  it("stringifies undefined", function () {
    expect(call("a", undefined)).to.equal("aundefined");
  });

  it("stringifies objects", function () {
    expect(call("a", {})).to.equal("a[object Object]");
  });

  it("stringifies numbers", function () {
    expect(call("a", 1)).to.equal("a1");
  });

  it("uses a custom separator", function () {
    expect(callSep(" ", "hello", "world")).to.equal("hello world");
    expect(callSep(", ", "a", "b", "c")).to.equal("a, b, c");
  });
});

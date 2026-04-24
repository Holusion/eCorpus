import { test as testHelper } from "./test.js";

function call(a: any, op: string, b: any): boolean {
  return testHelper.call({}, a, op as any, b, {});
}

describe("test helper", function () {
  it("== loose equality", function () {
    expect(call("foo", "==", "foo")).to.be.true;
    expect(call(0, "==", "0")).to.be.true;
    expect(call("foo", "==", "bar")).to.be.false;
  });

  it("=== strict equality", function () {
    expect(call(0, "===", 0)).to.be.true;
    expect(call(0, "===", "0")).to.be.false;
  });

  it("!= loose inequality", function () {
    expect(call("foo", "!=", "bar")).to.be.true;
    expect(call(0, "!=", 0)).to.be.false;
  });

  it("< and >", function () {
    expect(call(0, "<", 1)).to.be.true;
    expect(call(0, ">", 1)).to.be.false;
    expect(call(1, ">", 0)).to.be.true;
  });

  it(">= and <=", function () {
    expect(call(1, ">=", 1)).to.be.true;
    expect(call(1, "<=", 1)).to.be.true;
    expect(call(0, ">=", 1)).to.be.false;
    expect(call(2, "<=", 1)).to.be.false;
  });

  it("=< and => aliases", function () {
    expect(call(1, "=<", 1)).to.be.true;
    expect(call(1, "=>", 1)).to.be.true;
  });

  it("&& logical AND", function () {
    expect(call(true, "&&", true)).to.be.true;
    expect(call(true, "&&", false)).to.be.false;
  });

  it("|| logical OR", function () {
    expect(call(false, "||", true)).to.be.true;
    expect(call(false, "||", false)).to.be.false;
  });

  it("in — array membership", function () {
    expect(call("foo", "in", ["foo", "bar"])).to.be.true;
    expect(call("baz", "in", ["foo", "bar"])).to.be.false;
    expect(call("foo", "in", "foo")).to.be.true;
    expect(call("bar", "in", "foo")).to.be.false;
  });

  it("returns false for unsupported operators", function () {
    expect(call("a", "???" as any, "b")).to.be.false;
  });
});

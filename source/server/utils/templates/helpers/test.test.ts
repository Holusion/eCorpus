import { test as testHelper } from "./test.js";

function call(a: any, op: string, b: any): boolean {
  return testHelper.call({}, a, op as any, b, {});
}

function callWithSrc(a: any, op: string, b: any, filepath = ""): boolean {
  return testHelper.call({}, a, op as any, b, { data: { filepath } });
}

describe("test helper", function () {
  let warnMessages: any[][] = [];
  let origWarn: typeof console.warn;
  beforeEach(() => { warnMessages = []; origWarn = console.warn; console.warn = (...a: any[]) => warnMessages.push(a); });
  afterEach(() => { console.warn = origWarn; });

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

  it("chained: a && b == 'foo'", function () {
    // Simulates: {{test a "&&" b "==" "foo"}} with a=true, b="foo" → true
    expect(testHelper.call({}, true, "&&", "foo", "==", "foo", {})).to.be.true;
    // b="bar" → false
    expect(testHelper.call({}, true, "&&", "bar", "==", "foo", {})).to.be.false;
    // a=false → false even when b matches
    expect(testHelper.call({}, false, "&&", "foo", "==", "foo", {})).to.be.false;
  });

  it("chained: homogeneous && and || are unambiguous", function () {
    expect(testHelper.call({}, true, "&&", true, "&&", true, {})).to.be.true;
    expect(testHelper.call({}, true, "&&", false, "&&", true, {})).to.be.false;
    expect(testHelper.call({}, false, "||", false, "||", true, {})).to.be.true;
    expect(warnMessages).to.have.length(0);
  });

  it("warns and skips chaining for mixed && / ||", function () {
    // a && (b || c) vs (a && b) || c — ambiguous, fall back to simple a && b
    testHelper.call({}, true, "&&", false, "||", true, {});
    expect(warnMessages).to.have.length(1);
    expect(warnMessages[0].join(" ")).to.include("&&").and.include("||");
  });

  it("warns and skips chaining for comparison chained to comparison", function () {
    // a == (b == c) would compare a to a boolean — nonsensical
    testHelper.call({}, "foo", "==", "foo", "==", "foo", {});
    expect(warnMessages).to.have.length(1);
    expect(warnMessages[0].join(" ")).to.include("==");
  });

  it("warns and skips chaining for comparison chained to in", function () {
    testHelper.call({}, "foo", "in", ["foo"], "==", true, {});
    expect(warnMessages).to.have.length(1);
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

  it("warns with operator, values, and template path for unsupported operators", function () {
    callWithSrc("a", "???", "b", "home.hbs");
    expect(warnMessages).to.have.length(1);
    const msg = warnMessages[0].join(" ");
    expect(msg).to.include("???");
    expect(msg).to.include("a");
    expect(msg).to.include("b");
    expect(msg).to.include("home.hbs");
  });

  it("warns with template path for invalid argument count", function () {
    callWithSrc("a", "==" as any, undefined as any, "search.hbs");
    expect(warnMessages).to.have.length(1);
    expect(warnMessages[0].join(" ")).to.include("search.hbs");
  });
});

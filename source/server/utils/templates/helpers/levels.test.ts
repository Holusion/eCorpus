import { userLevel, accessLevel } from "./levels.js";

function callUserLevel(level: any, required: any, strict?: boolean): boolean {
  return userLevel.call({}, level, required, { hash: strict ? { strict: true } : {} });
}

function callAccessLevel(level: any, required: any, strict?: boolean): boolean {
  return accessLevel.call({}, level, required, { hash: strict ? { strict: true } : {} });
}

describe("userLevel helper", function () {
  let warnMessages: any[][] = [];
  let origWarn: typeof console.warn;
  beforeEach(() => { warnMessages = []; origWarn = console.warn; console.warn = (...a: any[]) => warnMessages.push(a); });
  afterEach(() => { console.warn = origWarn; });

  it("returns true when level meets required", function () {
    expect(callUserLevel("admin", "admin")).to.be.true;
    expect(callUserLevel("admin", "manage")).to.be.true;
    expect(callUserLevel("admin", "none")).to.be.true;
    expect(callUserLevel("create", "use")).to.be.true;
    expect(callUserLevel("none", "none")).to.be.true;
  });

  it("returns false when level is below required", function () {
    expect(callUserLevel("none", "admin")).to.be.false;
    expect(callUserLevel("use", "create")).to.be.false;
    expect(callUserLevel("manage", "admin")).to.be.false;
  });

  it("strict=true returns true only on exact match", function () {
    expect(callUserLevel("admin", "admin", true)).to.be.true;
    expect(callUserLevel("manage", "admin", true)).to.be.false;
    expect(callUserLevel("admin", "manage", true)).to.be.false;
  });

  it("returns false and warns on invalid level", function () {
    expect(callUserLevel("superuser", "admin")).to.be.false;
    expect(callUserLevel("admin", "superuser")).to.be.false;
    expect(callUserLevel("admin", null)).to.be.false;
    expect(warnMessages.length).to.be.greaterThan(0);
    expect(warnMessages[0].join(" ")).to.include("superuser").and.include("admin");
  });

  it("supports null/undefined as an alias of \"none\"", function () {
    expect(callUserLevel(null, "none")).to.be.true;
    expect(callUserLevel(null, "none", true)).to.be.true;
    expect(callUserLevel(null, "use")).to.be.false;
    expect(callUserLevel(null, "admin")).to.be.false;
    expect(callUserLevel(undefined, "none")).to.be.true;
    expect(callUserLevel(undefined, "none", true)).to.be.true;
    expect(callUserLevel(undefined, "use")).to.be.false;
    expect(warnMessages).to.have.length(0);
  });
});

describe("accessLevel helper", function () {
  let warnMessages: any[][] = [];
  let origWarn: typeof console.warn;
  beforeEach(() => { warnMessages = []; origWarn = console.warn; console.warn = (...a: any[]) => warnMessages.push(a); });
  afterEach(() => { console.warn = origWarn; });

  it("returns true when level meets required", function () {
    expect(callAccessLevel("admin", "admin")).to.be.true;
    expect(callAccessLevel("admin", "write")).to.be.true;
    expect(callAccessLevel("admin", "none")).to.be.true;
    expect(callAccessLevel("write", "read")).to.be.true;
    expect(callAccessLevel("none", "none")).to.be.true;
  });

  it("returns false when level is below required", function () {
    expect(callAccessLevel("none", "read")).to.be.false;
    expect(callAccessLevel("read", "write")).to.be.false;
    expect(callAccessLevel("write", "admin")).to.be.false;
  });

  it("strict=true returns true only on exact match", function () {
    expect(callAccessLevel("write", "write", true)).to.be.true;
    expect(callAccessLevel("admin", "write", true)).to.be.false;
    expect(callAccessLevel("read", "write", true)).to.be.false;
  });

  it("returns false and warns on invalid level", function () {
    expect(callAccessLevel("read", null)).to.be.false;
    expect(callAccessLevel("superwrite", "read")).to.be.false;
    expect(warnMessages.length).to.be.greaterThan(0);
    expect(warnMessages[0].join(" ")).to.include("null").and.include("read");
  });

  it("supports null/undefined as an alias of \"none\"", function () {
    expect(callAccessLevel(null, "none")).to.be.true;
    expect(callAccessLevel(null, "none", true)).to.be.true;
    expect(callAccessLevel(null, "read")).to.be.false;
    expect(callAccessLevel(null, "admin")).to.be.false;
    expect(callAccessLevel(undefined, "none")).to.be.true;
    expect(callAccessLevel(undefined, "none", true)).to.be.true;
    expect(callAccessLevel(undefined, "read")).to.be.false;
    expect(warnMessages).to.have.length(0);
  });
});

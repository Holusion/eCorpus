import { i18nHelper } from "./i18n.js";

function makeOpts(lang: string | undefined, hash: Record<string, any> = {}, tFn?: (...a: any[]) => string) {
  const t = tFn ?? ((key: string, ...args: any[]) => {
    const opts = args.find((a: any) => typeof a === "object" && !Array.isArray(a)) ?? {};
    return `${key}:${opts.lng ?? "?"}`;
  });
  return { hash, data: { t, root: { lang } } };
}

describe("i18n helper", function () {
  it("translates a key using context lang", function () {
    expect(i18nHelper.call({}, "greet", makeOpts("fr"))).to.equal("greet:fr");
    expect(i18nHelper.call({}, "greet", makeOpts("en"))).to.equal("greet:en");
  });

  it("forwards hash named params to t()", function () {
    const calls: any[][] = [];
    const opts = makeOpts("en", { what: "FOO" }, (...a: any[]) => { calls.push(a); return ""; });
    i18nHelper.call({}, "key", opts);
    expect(calls[0][1]).to.include({ what: "FOO" });
  });

  it("calls t(key, defaultValue, opts) when default is provided", function () {
    const calls: any[][] = [];
    const opts = makeOpts("en", {}, (...a: any[]) => { calls.push(a); return ""; });
    i18nHelper.call({}, "key", "default text", opts);
    expect(calls[0]).to.deep.equal(["key", "default text", { lng: "en" }]);
  });

  it("defaults lang to en when not set", function () {
    const calls: any[][] = [];
    const opts = makeOpts(undefined, {}, (...a: any[]) => { calls.push(a); return ""; });
    i18nHelper.call({}, "key", opts);
    expect(calls[0][1]).to.have.property("lng", "en");
  });

  it("returns the key when t is not a function", function () {
    const opts = { hash: {}, data: { t: "not-a-function", root: { lang: "en" } } };
    expect(i18nHelper.call({}, "my.key", opts)).to.equal("my.key");
  });
});

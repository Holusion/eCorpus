import i18next from "i18next";
import { i18nHelper } from "./i18n.js";

function makeOpts(lang: string | undefined, hash: Record<string, any> = {}, tFn?: (...a: any[]) => string) {
  const t = tFn ?? ((key: string, ...args: any[]) => {
    const opts = args.find((a: any) => typeof a === "object" && !Array.isArray(a)) ?? {};
    return `${key}:${opts.lng ?? "?"}`;
  });
  return { hash, data: { t, root: { lang } } };
}

describe("i18n helper", function () {
  let warnMessages: any[][] = [];
  let origWarn: typeof console.warn;
  beforeEach(() => { warnMessages = []; origWarn = console.warn; console.warn = (...a: any[]) => warnMessages.push(a); });
  afterEach(() => { console.warn = origWarn; });

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
    expect(warnMessages).to.have.length(1);
    expect(warnMessages[0].join(" ")).to.include("key");
  });

  it("returns the key when t is not a function", function () {
    const opts = { hash: {}, data: { t: "not-a-function", root: { lang: "en" }, filepath: "home.hbs" } };
    expect(i18nHelper.call({}, "my.key", opts)).to.equal("my.key");
    expect(warnMessages).to.have.length(1);
    const msg = warnMessages[0].join(" ");
    expect(msg).to.include("my.key");
    expect(msg).to.include("home.hbs");
  });

  describe("i18next engine behavior", function () {
    let tFr: (...a: any[]) => string;

    before(async function () {
      const instance = i18next.createInstance();
      await instance.init({
        resources: {
          fr: {
            translation: {
              titles: { sceneThumb: "Image d'aperçu pour {{what}}" },
              tooltips: { usersList: "Utilisateurs {{start}}-{{end}}/{{total}}" },
              leads: {
                tours_zero: "aucune visite guidée",
                tours_one: "{{count}} visite guidée",
                tours_other: "{{count}} visites guidées",
              },
            },
          },
        },
      });
      tFr = instance.t as any;
    });

    it("interpolates variables from hash params", function () {
      expect(i18nHelper.call({}, "titles.sceneThumb", makeOpts("fr", { what: "Ma Scène" }, tFr)))
        .to.equal("Image d'aperçu pour Ma Scène");
      expect(i18nHelper.call({}, "tooltips.usersList", makeOpts("fr", { start: 1, end: 10, total: 42 }, tFr)))
        .to.equal("Utilisateurs 1-10/42");
    });

    it("selects zero/one/other plural forms based on count", function () {
      ([
        [0, "aucune visite guidée"],
        [1, "1 visite guidée"],
        [5, "5 visites guidées"],
      ] as [number, string][]).forEach(([count, expected]) => {
        expect(
          i18nHelper.call({}, "leads.tours", makeOpts("fr", { count }, tFr)),
          `count=${count}`
        ).to.equal(expected);
      });
    });
  });
});

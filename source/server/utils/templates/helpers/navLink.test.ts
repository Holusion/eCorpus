import Handlebars from "handlebars";

import { navLink } from "./navLink.js";

function call(location: string | undefined, href: string, ...extras: any[]): string {
  return navLink.call({ location }, href, ...extras, { fn: () => "Label" });
}

describe("navLink helper", function () {
  it("creates an anchor with href", function () {
    expect(call(undefined, "/foo")).to.equal(`<a class="nav-link" href="/foo">Label</a>`);
  });

  it("adds active class on prefix match", function () {
    expect(call("/foo", "/foo")).to.equal(`<a class="nav-link active" href="/foo">Label</a>`);
    expect(call("/foo/bar", "/foo")).to.equal(`<a class="nav-link active" href="/foo">Label</a>`);
    expect(call("/bar", "/foo")).to.equal(`<a class="nav-link" href="/foo">Label</a>`);
  });

  it("exact mode requires strict match", function () {
    expect(call("/foo", "/foo", "exact")).to.equal(`<a class="nav-link active" href="/foo">Label</a>`);
    expect(call("/foo/bar", "/foo", "exact")).to.equal(`<a class="nav-link" href="/foo">Label</a>`);
  });

  it("appends extra string arguments as HTML attributes", function () {
    expect(call("/", "/foo", "disabled")).to.equal(`<a class="nav-link" href="/foo" disabled>Label</a>`);
    expect(call("/", "/foo", "disabled", 'id="foo"')).to.equal(`<a class="nav-link" href="/foo" disabled id="foo">Label</a>`);
  });

  describe("named parameters", function () {
    function named(hash: Record<string, any>, location: string = "/bar", ...extras: any[]): string {
      return navLink.call({ location }, "/foo", ...extras, { hash, fn: () => "Label" });
    }

    it("become attributes", function () {
      expect(named({ id: "foo", title: "Bar" })).to.equal(`<a class="nav-link" href="/foo" id="foo" title="Bar">Label</a>`);
    });

    it("can be named with a dash", function () {
      expect(named({ "aria-label": "Foo" })).to.equal(`<a class="nav-link" href="/foo" aria-label="Foo">Label</a>`);
    });

    it("come after extra string arguments", function () {
      expect(named({ id: "foo" }, "/bar", "disabled")).to.equal(`<a class="nav-link" href="/foo" disabled id="foo">Label</a>`);
    });

    it("don't get in the way of matching", function () {
      expect(named({ id: "foo" }, "/foo/bar")).to.equal(`<a class="nav-link active" href="/foo" id="foo">Label</a>`);
      expect(named({ id: "foo" }, "/foo/bar", "exact")).to.equal(`<a class="nav-link" href="/foo" id="foo">Label</a>`);
      expect(named({ id: "foo" }, "/foo", "exact")).to.equal(`<a class="nav-link active" href="/foo" id="foo">Label</a>`);
    });

    it("are escaped", function () {
      expect(named({ title: `"><script>alert('x')</script>` }))
        .to.equal(`<a class="nav-link" href="/foo" title="&quot;&gt;&lt;script&gt;alert(&#x27;x&#x27;)&lt;/script&gt;">Label</a>`);
    });

    it("are left out when they have no value", function () {
      expect(named({ a: undefined, b: null, c: false })).to.equal(`<a class="nav-link" href="/foo">Label</a>`);
    });

    it("keep values that only look empty", function () {
      expect(named({ tabindex: 0, title: "" })).to.equal(`<a class="nav-link" href="/foo" tabindex="0" title="">Label</a>`);
    });

    it("have no value when true", function () {
      expect(named({ disabled: true })).to.equal(`<a class="nav-link" href="/foo" disabled>Label</a>`);
    });

    describe("class", function () {
      it("replaces the base class, instead of becoming a second attribute", function () {
        expect(named({ class: "btn btn-outline" })).to.equal(`<a class="btn btn-outline" href="/foo">Label</a>`);
      });

      it("still tells if it's active", function () {
        expect(named({ class: "btn" }, "/foo/bar")).to.equal(`<a class="btn active" href="/foo">Label</a>`);
      });

      it("is escaped", function () {
        expect(named({ class: `a"b` })).to.equal(`<a class="a&quot;b" href="/foo">Label</a>`);
      });

      it("falls back to the base class when it has no value", function () {
        expect(named({ class: undefined })).to.equal(`<a class="nav-link" href="/foo">Label</a>`);
      });
    });

    describe("from a template", function () {
      function render(template: string, context: Record<string, any> = {}): string {
        const hbs = Handlebars.create();
        hbs.registerHelper("navLink", navLink);
        hbs.registerHelper("upper", (s: string)=> s.toUpperCase());
        return hbs.compile(template)({ location: "/bar", ...context });
      }

      it("takes literals", function () {
        expect(render(`{{#navLink "/foo" id="foo" class="btn"}}Label{{/navLink}}`))
          .to.equal(`<a class="btn" href="/foo" id="foo">Label</a>`);
      });

      it("takes variables, and leaves out those that are missing", function () {
        expect(render(`{{#navLink "/foo" id=name title=missing}}Label{{/navLink}}`, { name: "foo" }))
          .to.equal(`<a class="nav-link" href="/foo" id="foo">Label</a>`);
      });

      it("takes subexpressions", function () {
        expect(render(`{{#navLink "/foo" title=(upper "bar")}}Label{{/navLink}}`))
          .to.equal(`<a class="nav-link" href="/foo" title="BAR">Label</a>`);
      });

      it("escapes what comes from the context", function () {
        expect(render(`{{#navLink "/foo" title=name}}Label{{/navLink}}`, { name: `a"b` }))
          .to.equal(`<a class="nav-link" href="/foo" title="a&quot;b">Label</a>`);
      });

      it("doesn't escape twice what's already safe", function () {
        expect(render(`{{#navLink "/foo" title=name}}Label{{/navLink}}`, { name: new Handlebars.SafeString("a&amp;b") }))
          .to.equal(`<a class="nav-link" href="/foo" title="a&amp;b">Label</a>`);
      });

      it("works along with positional arguments", function () {
        expect(render(`{{#navLink "/bar" "exact" 'disabled' id="foo"}}Label{{/navLink}}`))
          .to.equal(`<a class="nav-link active" href="/bar" disabled id="foo">Label</a>`);
      });
    });
  });

  it("returns an error string when called with no href", function () {
    const result = navLink.call({}, { fn: () => "" });
    expect(result).to.include("Invalid block parameters");
  });
});

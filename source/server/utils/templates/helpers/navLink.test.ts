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

  it("returns an error string when called with no href", function () {
    const result = navLink.call({}, { fn: () => "" });
    expect(result).to.include("Invalid block parameters");
  });
});

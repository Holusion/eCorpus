import { dateString } from "./dateString.js";

const d = new Date("2024-06-15T12:00:00.000Z");

describe("dateString helper", function () {
  it("returns ISO string for format 'iso' (case-insensitive)", function () {
    expect(dateString.call({}, d, "iso", {})).to.equal(d.toISOString());
    expect(dateString.call({}, d, "ISO", {})).to.equal(d.toISOString());
  });

  it("uses a provided BCP 47 locale tag", function () {
    expect(dateString.call({}, d, "fr-FR", {})).to.equal(d.toLocaleString("fr-FR"));
    expect(dateString.call({}, d, "en-US", {})).to.equal(d.toLocaleString("en-US"));
  });

  it("falls back to context.lang when no format given", function () {
    expect(dateString.call({ lang: "en-US" }, d, {})).to.equal(d.toLocaleString("en-US"));
  });

  it("coerces a date string to Date", function () {
    expect(dateString.call({}, "2024-06-15T12:00:00.000Z", "iso", {})).to.equal(d.toISOString());
  });

  it("returns 'Invalid Date' when the options argument is missing", function () {
    expect(dateString.call({}, d)).to.equal("Invalid Date");
  });
});

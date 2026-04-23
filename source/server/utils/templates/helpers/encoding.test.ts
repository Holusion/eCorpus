import { encodeURIComponentHelper, encodeURIHelper } from "./encoding.js";

describe("encoding helpers", function () {
  describe("encodeURIComponent", function () {
    it("encodes spaces and special characters", function () {
      expect(encodeURIComponentHelper.call({}, "hello world")).to.equal("hello%20world");
      expect(encodeURIComponentHelper.call({}, "a=b&c=d")).to.equal("a%3Db%26c%3Dd");
    });
    it("preserves unreserved characters", function () {
      expect(encodeURIComponentHelper.call({}, "abc-_")).to.equal("abc-_");
    });
  });

  describe("encodeURI", function () {
    it("encodes spaces but preserves URI structure characters", function () {
      expect(encodeURIHelper.call({}, "https://example.com/path?q=hello world")).to.equal(
        "https://example.com/path?q=hello%20world"
      );
    });
    it("leaves a well-formed URL unchanged", function () {
      expect(encodeURIHelper.call({}, "https://example.com/path")).to.equal("https://example.com/path");
    });
  });
});

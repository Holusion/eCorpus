import { expect } from "chai";
import {
  getLogContext,
  normalizeRequestId,
  runWithLogContext,
} from "./context.js";

describe("log/context", function () {
  describe("normalizeRequestId()", function () {
    it("keeps a valid proxy-supplied id, trimmed", function () {
      expect(normalizeRequestId("abc-123")).to.equal("abc-123");
      expect(normalizeRequestId("  abc-123  ")).to.equal("abc-123");
    });

    it("mints a UUID when the header is missing or empty", function () {
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
      expect(normalizeRequestId(undefined)).to.match(uuid);
      expect(normalizeRequestId("")).to.match(uuid);
      expect(normalizeRequestId("   ")).to.match(uuid);
    });

    it("mints a UUID when the supplied id is over-long", function () {
      expect(normalizeRequestId("x".repeat(201))).to.not.equal("x".repeat(201));
      expect(normalizeRequestId("x".repeat(200))).to.equal("x".repeat(200));
    });
  });

  describe("runWithLogContext()", function () {
    it("exposes the context to synchronous and asynchronous descendants", async function () {
      expect(getLogContext()).to.be.undefined;
      const ctx = { request_id: "req-1" };
      await runWithLogContext(ctx, async function () {
        expect(getLogContext()).to.equal(ctx);
        await new Promise((resolve) => setImmediate(resolve));
        expect(getLogContext()).to.equal(ctx);
      });
      expect(getLogContext()).to.be.undefined;
    });
  });
});

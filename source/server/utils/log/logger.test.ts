import { expect } from "chai";
import { Writable } from "node:stream";
import pino from "pino";

import { buildLoggerOptions, runWithLogContext } from "./index.js";

/** Collects the JSON records a pino logger writes to its destination stream. */
function collectingLogger() {
  const records: any[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      records.push(JSON.parse(chunk.toString()));
      cb();
    },
  });
  return { records, logger: pino({ ...buildLoggerOptions(), level: "trace" }, stream) };
}

describe("log/logger", function () {
  it("emits the base fields on every line", function () {
    const { records, logger } = collectingLogger();
    logger.child({ module: "test" }).info("hello");

    expect(records).to.have.lengthOf(1);
    const [line] = records;
    expect(line).to.include({ level: "info", msg: "hello", module: "test", service: "ecorpus" });
    expect(line).to.have.property("build_ref");
    expect(line).to.have.property("pid");
    expect(line).to.have.property("time").that.is.a("string");
  });

  it("injects the request id from the active context", function () {
    const { records, logger } = collectingLogger();
    const ctx = { request_id: "req-42" };

    runWithLogContext(ctx, () => logger.info("with context"));
    logger.info("without context");

    expect(records[0]).to.include(ctx);
    expect(records[1]).to.not.have.property("request_id");
  });

  it("serializes Error objects under `err`", function () {
    const { records, logger } = collectingLogger();
    logger.error({ err: new Error("boom") }, "failed");

    expect(records[0].err).to.include({ type: "Error", message: "boom" });
    expect(records[0].err.stack).to.be.a("string");
  });
});

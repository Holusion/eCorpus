import fs from "fs/promises";
import os from "os";
import path from "path";

import { run, ExecError, OutputLine, parseLogLine } from "./exec.js";


async function collect(it: AsyncIterable<OutputLine>): Promise<OutputLine[]> {
  const lines: OutputLine[] = [];
  for await (const l of it) lines.push(l);
  return lines;
}

describe("run()", function(){
  it("yields output lines", async function(){
    const lines = await collect(run("echo", ["Hello World"]));
    expect(lines).to.deep.equal([{ fd: "stdout", line: "Hello World" }]);
  });

  it("splits lines and flushes a trailing partial line", async function(){
    const lines = await collect(run("printf", ["a\nb\r\nc"]));
    expect(lines.map(l => l.line)).to.deep.equal(["a", "b", "c"]);
  });

  it("interleaves stdout and stderr", async function(){
    const lines = await collect(run("bash", ["-c", "echo out; sleep 0.05; echo err >&2; sleep 0.05; echo out2"]));
    expect(lines).to.deep.equal([
      { fd: "stdout", line: "out" },
      { fd: "stderr", line: "err" },
      { fd: "stdout", line: "out2" },
    ]);
  });

  it("yields lines before the process exits", async function(){
    const start = Date.now();
    for await (const { line } of run("bash", ["-c", "echo first; sleep 1; echo second"])) {
      expect(line).to.equal("first");
      expect(Date.now() - start).to.be.below(500);
      break;
    }
  });

  it("kills the child when iteration stops early", async function(){
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "exec-test-"));
    const marker = path.join(dir, "marker");
    try {
      for await (const _ of run("bash", ["-c", `echo first; sleep 0.2; touch "${marker}"`])) break;
      await new Promise(r => setTimeout(r, 400));
      await expect(fs.access(marker)).to.be.rejectedWith("ENOENT");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("applies backpressure without losing lines", async function(){
    let count = 0;
    for await (const { line } of run("seq", ["1", "20000"], { highWaterMark: 10 })) {
      expect(line).to.equal((++count).toString());
      if (count % 1000 === 0) await new Promise(r => setTimeout(r, 1));
    }
    expect(count).to.equal(20000);
  });

  it("throws ExecError on non-zero exit code, after yielding output", async function(){
    const lines: string[] = [];
    let err: any;
    try {
      for await (const { line } of run("bash", ["-c", "echo failing >&2; exit 3"])) lines.push(line);
    } catch (e) {
      err = e;
    }
    expect(lines).to.deep.equal(["failing"]);
    expect(err).to.be.instanceOf(ExecError);
    expect(err).to.have.property("code", 3);
  });

  it("throws if interrupted by a signal", async function(){
    await expect(collect(run("bash", ["-c", "kill -TERM $$"]))).to.be.rejectedWith("Command bash was interrupted by signal SIGTERM");
  });

  it("throws if interrupted by an AbortSignal", async function(){
    const c = new AbortController();
    setTimeout(() => c.abort(), 10);
    await expect(collect(run("sleep", ["1"], { signal: c.signal }))).to.be.rejectedWith("The operation was aborted");
  });

  it("throws if command doesn't exist", async function(){
    await expect(collect(run("this-command-does-not-exist", []))).to.be.rejectedWith("ENOENT");
  });
});

describe("parseLogLine()", function(){
  it("reads a JSON log record", function(){
    expect(parseLogLine(`{"level":"info","message":"Running simplify"}`)).to.deep.equal({level: "info", message: "Running simplify"});
  });

  it("keeps the code and fields it doesn't know", function(){
    expect(parseLogLine(`{"level":"info","message":"Converted (40%)","progress":0.4,"stage":"write"}`)).to.deep.equal({
      level: "info", message: "Converted (40%)", progress: 0.4, stage: "write",
    });
    expect(parseLogLine(`{"level":"error","message":"cannot open 'scan.glb'","code":"file-unreadable"}`)).to.deep.equal({
      level: "error", message: "cannot open 'scan.glb'", code: "file-unreadable",
    });
  });

  it("reads a text line as a message at the fallback level", function(){
    const line = "meshtinker: 'nope' is not a meshtinker command. See 'meshtinker --help'.";
    expect(parseLogLine(line)).to.deep.equal({level: "warn", message: line});
    expect(parseLogLine(line, "error")).to.deep.equal({level: "error", message: line});
  });

  it("reads a line that isn't a log record as text", function(){
    for(const line of [`{"level":"info"`, `{"level":"info"}`, `{"message": 12}`, `{}`, `null`, `[]`]){
      expect(parseLogLine(line), line).to.deep.equal({level: "warn", message: line});
    }
  });

  it("gives the fallback level to a level it doesn't know", function(){
    expect(parseLogLine(`{"level":"notice","message":"hello"}`, "info")).to.deep.equal({level: "info", message: "hello"});
  });
});

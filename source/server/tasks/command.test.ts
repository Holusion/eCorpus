
import {run} from "./command.js";


describe("run()", function(){
  it("runs a command", async function(){
    let {code, stdout, stderr} = await run("echo", ["Hello World"]);
    expect(code).to.equal(0);
    expect(stdout).to.equal("Hello World\n");
    expect(stderr).to.equal("");
  });

  it("throw if interrupted by an AbortSignal", async function(){
    let c = new AbortController();
    setTimeout(()=> c.abort(), 10);
    await expect(run("sleep", ["1"], {signal: c.signal})).to.be.rejectedWith("The operation was aborted");
  });

  it("throw if interrupted by a signal", async function(){
    await expect(run("bash", ["-c", "kill -TERM $$"])).to.be.rejectedWith("Command bash was interrupted by signal SIGTERM");
  });

  it("can return code != 0", async function(){
    let {code,} = await run("bash", ["-c", "exit 1"]);
    expect(code).to.equal(1);
  });

})
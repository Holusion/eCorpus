import { Request } from "express";

import { prefers } from "./prefer.js";


function req(prefer?: string|string[]): Request{
  return { headers: typeof prefer === "undefined"? {}: { prefer } } as any;
}

describe("prefers()", function(){
  it("is false without a Prefer header", function(){
    expect(prefers(req(), "respond-async")).to.be.false;
  });

  it("finds a preference alone", function(){
    expect(prefers(req("respond-async"), "respond-async")).to.be.true;
  });

  it("finds a preference among others, ignoring case, values and parameters", function(){
    expect(prefers(req("wait=10, Respond-Async"), "respond-async")).to.be.true;
    expect(prefers(req("return=minimal; foo=bar, respond-async ; x"), "respond-async")).to.be.true;
    expect(prefers(req(["wait=10", "respond-async"]), "respond-async")).to.be.true;
  });

  it("doesn't match on a prefix, a value or a parameter", function(){
    expect(prefers(req("respond-async-later"), "respond-async")).to.be.false;
    expect(prefers(req("return=respond-async"), "respond-async")).to.be.false;
    expect(prefers(req("return=minimal; respond-async"), "respond-async")).to.be.false;
  });
});

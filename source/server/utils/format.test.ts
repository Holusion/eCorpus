import { formatBytes, isTimeInterval } from "./format.js";



describe("formatBytes()", function(){
  it("Format a number of bytes to a human readable string", function(){
    expect(formatBytes(1000)).to.equal("1 kB");
  });

  it("format mibibytes", function(){
    expect(formatBytes(1024, false)).to.equal("1 KiB");
    expect(formatBytes(1024*1024, false)).to.equal("1 MiB");
  });
});


describe("isTimeInterval()", function(){
  it("Returns false for Date objects", function(){
    expect(isTimeInterval(new Date())).to.be.false;
  });
  it("Returns false for timestamps", function(){
    expect(isTimeInterval(Date.now())).to.be.false;
  });
  it("Returns false for ISO Date strings", function(){
    expect(isTimeInterval(new Date().toISOString())).to.be.false;
  });
  it("Returns true for ISO8601 period strings", function(){
    [
      "P1Y",
      "P1M1D",
      "PT1M", // 1 minute
      "PT1.5S", // Seconds are fractional
    ].forEach(function(s){
      expect(isTimeInterval(s), `${s} should be a valid ISO8601 period string`).to.be.true;
    })
  })
})
import { crc32 } from "./crc32.js";

describe("crc32", function(){

  it("computes a crc32 sum over a buffer", function(){
    let crc = crc32();
    crc.next(Buffer.from("hello world\n"));
    expect((crc.next().value).toString(16)).to.equal(0xaf083b2d.toString(16));
  });
  it("can be updated", function(){
    let crc = crc32();
    crc.next(Buffer.from("hello "));
    crc.next(Buffer.from("world"));
    crc.next(Buffer.from("\n"));
    expect((crc.next().value).toString(16)).to.equal(0xaf083b2d.toString(16));
  });
  it("checks known values", function(){
    ([
      ["{}", 2745614147],
      ["foo\n", 2117232040],
    ] as [string, number][]).forEach(([s, sum])=>{
      let crc = crc32();
      crc.next(Buffer.from(s))
      expect(crc.next().value, `Expected CRC32 sum for ${s} to be ${sum}`).to.equal(sum);
    });
  })
});
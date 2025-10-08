import { mapShape } from "./processor.js";


describe("mapShape()", function(){
  it("maps identity", function(){
    expect(mapShape("$", ["value"])).to.deep.equal(["value"]);

  })
  it("maps outputs to a shape", function(){
    expect(mapShape({foo: "bar", out: "$"}, ["value"])).to.deep.equal({foo: "bar", out: ["value"]});
  });

  it("maps output array", function(){
    expect(mapShape({foo: "$[0]"}, ["value"])).to.deep.equal({foo: "value"});
  });

  it("maps outputs properties to a shape", function(){
    expect(mapShape({foo: "$[0].foo", bar: "$[0].bar", baz: "baz"}, [{foo: "foo", bar: "bar"}])).to.deep.equal({foo: "foo", bar: "bar", baz: "baz"});
  });
});
import { mapShape } from "./groupOutputs.js";



describe("mapShape()", function(){
  let m:Map<number, any>;
  this.beforeEach(function(){
    m = new Map([[1, "value"]]);
  })
  it("maps identity", function(){
    expect(mapShape("$", m)).to.deep.equal(["value"]);
  });
  
  it("maps outputs to a shape", function(){
    expect(mapShape({foo: "bar", out: "$"}, m)).to.deep.equal({foo: "bar", out: ["value"]});
  });

  it("maps output array", function(){
    expect(mapShape({foo: "$[1]"}, m)).to.deep.equal({foo: "value"});
  });

  it("maps outputs properties to a shape", function(){
    m.set(2, {foo:"foo"});
    m.set(4, {bar: "bar"});
    expect(mapShape({foo: "$[2].foo", bar: "$[4].bar", baz: "baz"}, m )).to.deep.equal({foo: "foo", bar: "bar", baz: "baz"});
  });
});


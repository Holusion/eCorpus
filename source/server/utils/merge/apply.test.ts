
import {DELETE_KEY, SOURCE_INDEX} from "./pointers/types.js";
import apply from "./apply.js";

describe("merge.apply()", function(){
  it("applies a no-op", function(){
    const a = {a:1};
    expect(apply(a, {})).to.deep.equal(a);
  });

  it("merges a deleted key", function(){
    expect(apply({a:1, b:2}, {b:DELETE_KEY})).to.deep.equal({a:1});
  });
  
  it("merges an updated key", function(){
    expect(apply({a:1, b:2}, {b:3})).to.deep.equal({a:1, b:3});
  });

  it("merges nested objects", function(){
    expect(apply({a:{b:1}, c:3}, {a:{b:2}})).to.deep.equal({a:{b:2}, c:3});
  });

  it("merges created properties", function(){
    expect(apply<any>({a:1}, {b:2})).to.deep.equal({a:1, b:2});
  });

  it("merges updated arrays", function(){
    expect(apply({a:[1,2]}, {a:{0:1, 1:3}})).to.deep.equal({a:[1,3]});
  });

  it("merges created arrays", function(){
    expect(apply({a:"A"}, { b:[{name:"A1"}]} as any)).to.deep.equal({a:"A", b:[{name:"A1"}]});
  })

  it("compacts arrays", function(){
    expect(apply({a:[{name: "A"}, {name: "B"}, {name: "C"}]}, {a:{0:{name: "A'"}, 1: DELETE_KEY}} as any)).to.deep.equal({a:[
      {name: "A'"},
      {name: "C"} // C gets pushed-back to index 2
    ]});
  });

  it("merges special SOURCE_INDEX symbol", function(){
    expect(apply({a:{[SOURCE_INDEX]:0}}, {a:{[SOURCE_INDEX]:1}})).to.deep.equal({a:{[SOURCE_INDEX]:1}});
  });
});
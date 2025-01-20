
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
  it("merges array of null", function(){
    expect(apply({a:[null,null]}, {a:{0:null, 1:3}})).to.deep.equal({a:[null,3]});
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

  it("prevents prototype pollution (create object)", function(){
    //This is not a strict
    let result:any = apply({}, {a:{__proto__: {isAdmin: true}, tick: 1} as any});
    expect(result.a, `Expected prototype pollution to be filtered internally`).to.not.have.property("isAdmin");
  });

  it("prevents prototype pollution (update object)", function(){
    let result :any = apply({a: {tick: 0}}, {a:{__proto__: {isAdmin: true}, tick: 1} as any});
    expect(result).to.deep.equal({a:{tick: 1}});
    expect(result.a, `Expected prototype pollution to be filtered internally`).to.not.have.property("isAdmin");
  });

  it("prevents prototype pollution (create array)", function(){
    let ref:any = [];
    let val:any = [];
    val.__proto__ = {isAdmin: true};
    let result :any = apply({}, {a: val});
    expect(ref, `Expected prototype pollution to be filtered internally`).to.not.have.property("isAdmin");
    //This is partially mitigated because Array.prototype is not affected but result.a.isAdmin is still true.
  });
});
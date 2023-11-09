import {DELETE_KEY, apply, diff} from "./merge.js";



describe("merge.diff()", function(){
  describe("handle native data types ", function(){
    [ //All JSON-serializable data types with possible bounday values
      1,
      0,
      "1",
      "",
      true,
      false,
      null,
      {},
      {a:1},
      [],
    ].forEach(v=>{
      const v_clone :typeof v = JSON.parse(JSON.stringify(v));
      it(`${JSON.stringify(v)} deep equals itself`, function(){
        expect(diff({v}, {v:v_clone})).to.deep.equal({});
      });
      it(`${JSON.stringify({v})} compares from {}`, function(){
        expect(diff({}, {v})).to.deep.equal({v:v_clone});
      });
      it(`${JSON.stringify({v})} compares from {}`, function(){
        expect(diff({v}, {})).to.deep.equal({v:DELETE_KEY});
      });
    });
  });

  describe("arrays", function(){
    //Arrays behave like objects with numeric keys, with some specific handling

    it("handles an array equality", function(){
      expect(diff({a:["foo"]}, {a:["foo"]})).to.deep.equal({});
    });

    it("handles nested objects equality", function(){
      expect(diff({a:[{v: "foo"}]}, {a:[{v:"foo"}]})).to.deep.equal({});
    });

    it("handle array.push", function(){
      expect(diff({a:[]}, {a:[1]})).to.deep.equal({a:{0:1}});
      expect(diff({a:[1]}, {a:[1, 2]})).to.deep.equal({a:{1:2}});
    });
    
    it("handle Array.pop", function(){
      expect(diff({a:[1]}, {a:[]})).to.deep.equal({a:{0: DELETE_KEY}});
      expect(diff({a:[1, 2]}, {a:[1]})).to.deep.equal({a:{1: DELETE_KEY}});
    });
  
    it("handle Array.replace", function(){
      expect(diff({a:["foo", "bar"]}, {a:["foo", "baz"]})).to.deep.equal({a:{1: "baz"}});
    });

    it("handle Array.splice", function(){
      // Might be improved to detect a splice and use special syntax to represent it
      expect(diff({a:["foo", "bar", "baz"]}, {a:["foo", "baz"]})).to.deep.equal({a:{1: "baz", 2: DELETE_KEY}});
    });

    it("throws when diffing an array with an object", function(){
      expect(()=>diff({a:[]}, {a:{}})).to.throw("Can't diff an array with an object");
    });


  });
});


describe("merge.apply()", function(){
  it("merges a no-op", function(){
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
  it("merges updated arrays", function(){
    expect(apply({a:[1,2]}, {a:{0:1, 1:3}})).to.deep.equal({a:[1,3]});
  });
});


describe("three-way merge", function(){
  // This is the real point of this module
  it("string update", function(){
    /** @TODO could try to do string splicing for finer results */
    const ref = {greet:"Hello", name:"World"};
    const current = {greet:"Hi", name:"World"};
    const next = {greet:"Hello", name:"Universe"};
    expect(apply(current, diff(ref, next))).to.deep.equal({greet:"Hi", name:"Universe"});
  });
});

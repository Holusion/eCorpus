
import {DELETE_KEY} from "./pointers/types.js";

import diff from "./diff.js";

describe("merge.diff()", function(){
  describe("native types", function(){
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
    it("special-case for null recursion", function(){
      expect(diff({
        v: {a:1},
      }, {v: null}))
    });

    it("ignores undefined values", function(){
      //keys that are undefined will not be serialized so we can safely ignore them
      expect(diff({v:undefined}, {v:undefined})).to.deep.equal({});
      expect(diff({v:undefined}, {})).to.deep.equal({});
      expect(diff({}, {v:undefined})).to.deep.equal({});
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

    it("handle Array creation", function(){
      expect(diff({name:"A"}, {name:"A", articles: [{id:"1"}]})).to.deep.equal({articles: [{id:"1"}]});
    });

    it("handle deep changes", function(){
      expect(diff({a:[{v:"foo"}, {v:"bar"}]}, {a:[{v:"foo"}, {v:"baz"}]})).to.deep.equal({a:{1:{v:"baz"}}});
    });

    it("throws when diffing an array with an object", function(){
      expect(()=>diff({a:[]}, {a:{}})).to.throw("Can't diff an array with an object");
    });
  });

  describe("objects", function(){
    it("deep merge objects", function(){
      expect(diff<any>({v: {a: 1 }}, {v: {a:1, b:2}})).to.deep.equal({v:{b:2}});
    });
  });
});

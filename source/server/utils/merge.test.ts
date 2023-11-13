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

    it("handle deep changes", function(){
      expect(diff({a:[{v:"foo"}, {v:"bar"}]}, {a:[{v:"foo"}, {v:"baz"}]})).to.deep.equal({a:{1:{v:"baz"}}});
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
  /* This is the real point of this module
   * For consistency, tests should follow the following naming scheme:
   * a *ref* as the common source, 
   * a *current* as the document that have been saved in-between
   * a *next* as the document that is being saved now
   */

  it("string update", function(){
    /** @TODO could try to do string splicing for finer results */
    const ref = {greet:"Hello", name:"World"};
    const current = {greet:"Hi", name:"World"};
    const next = {greet:"Hello", name:"Universe"};
    expect(apply(current, diff(ref, next))).to.deep.equal({greet:"Hi", name:"Universe"});
  });

  it.skip("ignores camera translation/rotation changes", function(){
    //This is a potential optimization
    //The camera node's position can safely be ignored as it will get reset on load, in favor of `scene.setups[].navigation`
  });

  describe.skip("conflict resolution", function(){
    //Test only cases where "smart" conflict resolution is possible
    describe("by ID", function(){
      //Here it would be possible to differentiate annotations or articles by their id
      //thus detecting a double-push and resolving it
        const A1 = { "id": "mMzG2tLjmIst", "titles": { "EN": "A1"} }
        const A2 = { "id": "FiIaONzRIbL4", "titles": { "EN": "A2"} }
        const A3 = { "id": "rJpCltJjxyyL", "titles": { "EN": "A3"} }
      it("handle double array push (annotations)", function(){
        const ref = {annotations: [A1], title: "foo"};
        const current = {annotations: [A1,A2]};
        const next = {annotations: [A1,A3]};

        const d = diff(ref, next);
        expect(d).to.deep.equal({annotations: {1: A3}});
        expect(apply(current, d)).to.deep.equal({annotations: [A1,A2,A3], title: "foo"});
      });
  
      it.skip("handle double array push (articles)", function(){
        const ref = {articles: [A1], title: "foo"};
        const current = {articles: [A1,A2]};
        const next = {articles: [A1,A3]};
        expect(apply(current, diff(ref, next))).to.deep.equal({articles: [A1,A2,A3], title: "foo"});
      });
    })

    describe.skip("by name", function(){

      it("reassign scene nodes appropriately", function(){
        //Differentiate nodes by their names
        //However, we also need to handle possible conflict in `scenes[x].nodes` if we reorder nodes.
        const N1 = { "name": "n1"};
        const N2 = { "name": "n2"};
        const N3 = { "name": "n3"};
        const ref = {nodes: [N1], scenes:[{nodes:[0]}] };
        const current = {nodes: [N1,N2], scenes:[{nodes:[0, 1]}]};
        const next = {nodes: [N1,N3], scenes:[{nodes:[0, 1]}]};

        expect(apply(current, diff(ref, next))).to.deep.equal({nodes: [N1,N2,N3], scenes:[{nodes:[0, 1, 2]}]});
        //FIXME a node's children might also be affected.
      });

      it("reassign nodes children appropriately", function(){
        
      });

      ["lights", "cameras", "models"].forEach(type=>{
        it(`reassign ${type} appropriately`, function(){
          //Lights have no property that could be used to differentiate them
          //We can only suppose that if someone adds a node, the light attached to this node is unique to this one and should stay with it.
        });
      });
    });


  });
});

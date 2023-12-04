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

  describe("fields ignore optimization", function(){
    //This is a potential optimization
    //The camera node's position can safely be ignored as it will get reset on load, in favor of `scene.setups[].navigation`
    it("ignores camera translation changes", function(){
      const ref = {nodes:[{name:"camera", translation:[1,0,0]}]};
      const next = {nodes:[{name:"camera", translation:[0,1,0]}]};
      expect(apply(ref, diff(ref, next))).to.deep.equal({nodes:[{name:"camera", translation:[1,0,0]}]});
    });
  })

  describe("conflict resolution", function(){
    //Test only cases where "smart" conflict resolution is possible
    describe("by ID", function(){
      //Here it would be possible to differentiate annotations or articles by their id
      //thus detecting a double-push and resolving it
      let A1: any, A2: any, A3 : any;
      beforeEach(function(){
        A1 = { "id": "mMzG2tLjmIst", "titles": { "EN": "A1"} }
        A2 = { "id": "FiIaONzRIbL4", "titles": { "EN": "A2"} }
        A3 = { "id": "rJpCltJjxyyL", "titles": { "EN": "A3"} }
      });

      it("handle double array push (annotations)", function(){
        const ref = {annotations: [A1]};
        const current = {annotations: [A1, A2]};
        const next = {annotations: [A1, A3]};

        const d = diff(ref, next);
        expect(d).to.deep.equal({annotations: {1: A3}});
        expect(apply(current, d)).to.deep.equal({annotations: [A1, A2, A3]});
      });

      it("can still modify annotations in place", function(){
        const A1b = {"id": "mMzG2tLjmIst",  "titles":  { "EN": "A1b", "FR": "A1b"} }
        const ref = {annotations: [A1]};
        const current = {annotations: [A1, A2]};
        const next = {annotations: [A1b]};
        expect(apply(current, diff(ref, next))).to.deep.equal({annotations: [A1b, A2]});

      })
  
      it("handle double array push (articles)", function(){
        const ref = {articles: [A1]};
        const current = {articles: [A1, A2]};
        const next = {articles: [A1, A3]};
        const d = diff(ref, next);
        expect(d).to.deep.equal({articles: {1: A3}});
        const patch = apply(current, d)
        expect(patch, JSON.stringify(patch)).to.deep.equal({articles: [A1, A2, A3]});
      });
    })

    describe("by name", function(){

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
      });

      it("reassign nodes children appropriately", function(){
        const common = [
          {name: "Parent", children: [1,2]},
          {name: "Child 1"},
          {name: "Child 2"},
        ]
        const parent2 = { "name": "Parent 2"};
        const child3 = { "name": "Child 3"};
        const ref = {nodes: common, scenes:[{nodes:[0]}] };
        const current = {nodes: [...common, parent2], scenes:[{nodes:[0, 3]}]};
        const next = {nodes: [{name:"Parent", children:[1,2,3] }, ...common.slice(1), child3], scenes:[{nodes:[0]}]};

        expect(apply(current, diff(ref, next))).to.deep.equal({nodes: [
          {name:"Parent", children:[1,2,4] },
          common[1],
          common[2],
          parent2,
          child3,
        ], scenes:[{nodes:[0, 3]}]});
      });

      ["lights", "cameras", "models"].forEach(type=>{
        it(`reassign ${type} appropriately`, function(){
          const stype = type.slice(0, -1);
          function make(nodes: object[]=[], types: object[]=[]){
            return {
              nodes: [
                {name: `${stype}.0`, [stype]: 0},
                ...nodes,
              ], [type]:[
                {reference: "default item"},
                [...types]
              ]
            };
          }
          //Lights, cameras and models have no property that could be used to differentiate them
          //We can only suppose that if someone adds a node, the light attached to this node is unique to this one and should stay with it.
          const ref = make();
          const current = make([{name: `${stype}.current`, [stype]: 1}], [{reference: "current_item"}]);
          const next = make([{name: `${stype}.next`, [stype]: 1}], [{reference: "next_item"}]);

          expect(apply(current, diff(ref, next))).to.deep.equal({
            nodes: [
              {name: `${stype}.0`, [stype]: 0},
              {name: `${stype}.current`, [stype]: 1},
              {name: `${stype}.next`, [stype]: 2},
            ], [type]:[
              {reference: "default item"},
              {reference: "current_item"},
              {reference: "next_item"},
            ]
          });

        });
      });
    });


  });
});

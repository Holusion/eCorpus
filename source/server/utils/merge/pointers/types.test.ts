import { fromMap, SOURCE_INDEX, toIdMap } from "./types.js"



describe("toIdMap() / fromMap()", function(){
  it("uses ID if available", function(){
    const map = toIdMap([{id: "foo", name: "bar"}])
    expect(map).to.deep.equal({foo:{id: "foo", name: "bar", [SOURCE_INDEX]: 0}})
  });
  it("falls back to uri", function(){
    const map = toIdMap([{uri: "baz", name: "bar"}])
    expect(map).to.deep.equal({baz:{uri: "baz", name: "bar", [SOURCE_INDEX]: 0}})
  });
  it("falls back to name", function(){
    const map = toIdMap([{name: "bar"}])
    expect(map).to.deep.equal({bar:{name: "bar", [SOURCE_INDEX]: 0}})
  });

  it("keeps arrays ordering", function(){
    let init = [{id: "c"}, {id: "a"}, {id: "b"}];
    const m = toIdMap(init);
    //Try to mess it up
    expect(m).to.have.property("c");
    let ref = m["c"];
    delete m.c;
    m["c"] = ref;
    
    const arr = fromMap(m);
    expect(arr).to.deep.equal([{id: "c"}, {id: "a"}, {id: "b"}]);
  });
});

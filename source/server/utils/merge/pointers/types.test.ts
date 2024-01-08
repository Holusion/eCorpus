import { toIdMap } from "./types.js"



describe("idMap", function(){
  it("uses ID if available", function(){
    const map = toIdMap([{id: "foo", name: "bar"}])
    expect(map).to.deep.equal({foo:{id: "foo", name: "bar"}})
  });
  it("falls back to uri", function(){
    const map = toIdMap([{uri: "baz", name: "bar"}])
    expect(map).to.deep.equal({baz:{uri: "baz", name: "bar"}})
  });
  it("falls back to name", function(){
    const map = toIdMap([{name: "bar"}])
    expect(map).to.deep.equal({bar:{name: "bar"}})
  });
});
import { parseFilepath } from "./archives.js"



describe("parseFilepath()", function(){
  it("ignores base `scenes` directory", function(){
    expect(parseFilepath(`/scenes/`)).to.deep.equal({isDirectory: true});
  });
  it("finds scene name and relative file path", function(){
    expect(parseFilepath(`/scenes/foo/scene.svx.json`)).to.deep.equal({scene: "foo", name:"scene.svx.json", isDirectory: false});
  });
  it("finds nested paths", function(){
    expect(parseFilepath(`/scenes/foo/articles/hello.html`)).to.deep.equal({scene: "foo", name:"articles/hello.html", isDirectory: false});
  });
  it("find nested folders", function(){
    //Also, strips trailing slash.
    expect(parseFilepath(`/scenes/foo/articles/`)).to.deep.equal({scene: "foo", name:"articles", isDirectory: true});
  })
  it("find scene folder", function(){
    expect(parseFilepath(`/scenes/foo/`)).to.deep.equal({scene: "foo", name: undefined, isDirectory: true});
  })
})
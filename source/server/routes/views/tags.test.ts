import request from "supertest";

describe("GET /ui/tags/:tag", function(){
  this.beforeAll(async function(){
    const { vfs } = await createIntegrationContext(this);
    await vfs.createScene("tagged-scene");
    await vfs.addTag("tagged-scene", "àtrier");
    await vfs.addTag("tagged-scene", "a#b?c");
  });

  it("shows a tag's scenes", async function(){
    const { text } = await request(this.server).get(`/ui/tags/${encodeURIComponent("àtrier")}`)
      .set("Accept", "text/html")
      .expect(200);
    expect(text).to.contain("tagged-scene");
  });

  it("rejects a tag that isn't valid UTF-8", async function(){
    // e.g. "à" escaped in Latin-1 (%E0): no link of ours produces it
    await request(this.server).get("/ui/tags/%E0trier")
      .set("Accept", "text/html")
      .expect(400);
  });

  it("links to tags with reserved characters", async function(){
    const { text } = await request(this.server).get("/ui/scenes/tagged-scene")
      .set("Accept", "text/html")
      .expect(200);
    expect(text).to.contain(`href="/ui/tags/${encodeURIComponent("a#b?c")}"`);
  });
});

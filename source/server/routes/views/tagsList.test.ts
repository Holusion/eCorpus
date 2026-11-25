import request from "supertest";

describe("GET /ui/tags/", function(){
  this.beforeAll(async function(){
    const { vfs, userManager } = await createIntegrationContext(this);
    //Can read all 4 tags
    await userManager.addUser("admin", "12345678", "admin");
    //Tags sorted before "z_public" are only set on scenes anonymous users can't read
    await vfs.createScene("public-scene");
    await vfs.addTag("public-scene", "z_public");
    for(let i = 0; i < 3; i++){
      const name = `private-${i}`;
      await vfs.createScene(name);
      await userManager.setPublicAccess(name, "none");
      await userManager.setDefaultAccess(name, "none");
      await vfs.addTag(name, `a_private_${i}`);
      await vfs.addTag(name, "z_public");
    }
  });

  it("pages through the tags the user can read", async function(){
    const { text } = await request(this.server).get("/ui/tags/?limit=1")
      .set("Accept", "text/html")
      .expect(200);
    expect(text).to.contain(`id="z_public"`);
    expect(text).not.to.contain("a_private_");
  });

  it("shows a next button only when there are more tags", async function(){
    //Anonymous users can read 1 tag, the admin can read 4
    let { text } = await request(this.server).get("/ui/tags/?limit=1")
      .set("Accept", "text/html")
      .expect(200);
    expect(text, "last page is full").not.to.contain(`id="search-next"`);

    ({ text } = await request(this.server).get("/ui/tags/?limit=3")
      .set("Authorization", await bearer("admin"))
      .set("Accept", "text/html")
      .expect(200));
    expect(text).to.contain(`id="search-next"`);
    expect(text.match(/role="listitem"/g), "shows only the requested tags").to.have.length(3);

    ({ text } = await request(this.server).get("/ui/tags/?limit=4")
      .set("Authorization", await bearer("admin"))
      .set("Accept", "text/html")
      .expect(200));
    expect(text, "last page is full").not.to.contain(`id="search-next"`);
    expect(text.match(/role="listitem"/g)).to.have.length(4);
  });

  it("counts the scenes the user can read", async function(){
    const { text } = await request(this.server).get("/ui/tags/")
      .set("Accept", "text/html")
      .expect(200);
    expect(text).to.match(/class="tag-size[^"]*"[^>]*>\s*<span>1<\/span>/);
  });
});

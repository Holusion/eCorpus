import request from "supertest";


describe("The main navbar", function(){
  /** The opening tag of a link in the navbar */
  const linkTo = (text: string, href: string)=>{
    const nav = /<nav id="main-navbar".*?<\/nav>/s.exec(text)?.[0] ?? "";
    const tag = nav.match(/<a [^>]*>/g)?.find(a=> a.includes(`href="${href}`));
    expect(tag, `link to ${href}`).to.be.a("string");
    return tag!;
  };

  this.beforeAll(async function(){
    const {userManager} = await createIntegrationContext(this);
    await userManager.addUser("bob", "12345678", "create");
  });

  it("doesn't name links after something else than what they show", async function(){
    const {text} = await request(this.server).get("/ui/tags").set("Authorization", await bearer("bob")).expect(200);
    //An aria-label takes over the content of a link for those who rely on it
    expect(linkTo(text, "/ui/upload/")).not.to.include("aria-label");
    expect(linkTo(text, "/ui/user/")).not.to.include("aria-label");
  });

  it("says where the login link goes", async function(){
    const {text} = await request(this.server).get("/ui/tags").expect(200);
    expect(linkTo(text, "/auth/login/")).to.include(`title="/auth/login/"`);
  });
});

import request from "supertest";

describe("localized scene not-found pages", function(){
  const frenchMessage = "La ressource demandée est introuvable. Elle est peut-être privée ou n&#x27;existe pas.";

  this.beforeAll(async function(){
    const { vfs, userManager } = await createIntegrationContext(this, { DEFAULT_LANGUAGE: "fr" });
    await userManager.addUser("reader", "12345678");
    await userManager.addUser("admin", "12345678", "admin");
    const scene = await vfs.createScene("private-scene");
    await userManager.setPublicAccess(scene, "none");
    await userManager.setDefaultAccess(scene, "none");
  });

  for(const scene of ["missing-scene", "private-scene"]){
    for(const authenticated of [false, true]){
      it(`translates ${scene} for an ${authenticated ? "authenticated" : "anonymous"} reader`, async function(){
        const req = request(this.server).get(`/ui/scenes/${scene}`)
          .set("Accept", "text/html")
          .set("Accept-Language", "fr");
        if(authenticated) req.set("Authorization", await bearer("reader"));
        const { text } = await req.expect(404)
          .expect("Content-Language", "fr")
          .expect("Vary", /Accept-Language/);
        expect(text).to.contain('<html lang="fr">');
        expect(text).to.contain('class="error-title">Erreur :404');
        expect(text).to.contain(frenchMessage);
      });
    }
  }

  it("uses the instance default when the header is absent or unsupported", async function(){
    for(const language of [undefined, "de"]){
      const req = request(this.server).get("/ui/scenes/missing-scene").set("Accept", "text/html");
      if(language) req.set("Accept-Language", language);
      const { text } = await req.expect(404).expect("Content-Language", "fr");
      expect(text).to.contain(frenchMessage);
    }
  });

  it("translates a missing scene for an administrator", async function(){
    const { text } = await request(this.server).get("/ui/scenes/missing-scene")
      .set("Authorization", await bearer("admin"))
      .set("Accept", "text/html")
      .set("Accept-Language", "fr")
      .expect(404)
      .expect("Content-Language", "fr");
    expect(text).to.contain(frenchMessage);
  });

  it("uses a supported header ahead of the instance default", async function(){
    const { text } = await request(this.server).get("/ui/scenes/missing-scene")
      .set("Accept", "text/html")
      .set("Accept-Language", "en")
      .expect(404)
      .expect("Content-Language", "en");
    expect(text).to.contain('class="error-title">Error :404');
    expect(text).to.contain("Can&#x27;t find the requested resource.");
  });

  it("keeps the session language ahead of the header", async function(){
    const agent = request.agent(this.server);
    await agent.get("/ui/scenes/missing-scene?lang=fr")
      .set("Accept", "text/html")
      .set("Accept-Language", "en")
      .expect(404)
      .expect("Content-Language", "fr");
    const { text } = await agent.get("/ui/scenes/private-scene")
      .set("Accept", "text/html")
      .set("Accept-Language", "en")
      .expect(404)
      .expect("Content-Language", "fr");
    expect(text).to.contain(frenchMessage);
  });
});

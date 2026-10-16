import request from "supertest";

describe("authentication error localization", function() {
  this.beforeAll(async function() {
    const { userManager } = await createIntegrationContext(this);
    await userManager.addUser("localization-user", "12345678");
  });

  it("uses the shared error formatter for login's custom JSON response", async function() {
    const en = await request(this.server).post("/auth/login")
      .send({ username: "localization-user", password: "wrong-password" }).expect(401);
    const fr = await request(this.server).post("/auth/login")
      .set("Accept-Language", "fr")
      .send({ username: "localization-user", password: "wrong-password" }).expect(401);
    expect(en.body).to.include({ messageCode: "errors.bad-password", message: "Error: [401] Bad password" });
    expect(fr.body.messageCode).to.equal(en.body.messageCode);
    expect(fr.body.message).not.to.equal(en.body.message);
    expect(fr.body.message).not.to.contain("errors.");
  });

  it("renders localized login errors without translating their text a second time", async function() {
    const { text } = await request(this.server).post("/auth/login")
      .accept("html").set("Accept-Language", "fr")
      .send({ username: "localization-user", password: "wrong-password" }).expect(401);
    expect(text).to.contain('role="alert">Mot de passe incorrect</span>');
    expect(text).not.to.contain("errors.Mot");
  });

  it("localizes early validation errors through the central middleware", async function() {
    const en = await request(this.server).post("/auth/login").send({}).expect(400);
    const fr = await request(this.server).post("/auth/login?lang=fr").send({}).expect(400);
    expect(en.body.messageCode).to.equal("errors.username-not-provided");
    expect(fr.body.messageCode).to.equal(en.body.messageCode);
    expect(fr.body.message).not.to.equal(en.body.message);
  });
});

import request from "supertest";
import type { Application } from "express";

describe("GET /ui/upload/report", function() {
  let server: Application;
  let creator: number;
  let reader: number;

  this.beforeAll(async function() {
    const { userManager } = await createIntegrationContext(this);
    server = this.server;
    creator = (await userManager.addUser("report-creator", "12345678", "create")).uid;
    reader = (await userManager.addUser("report-reader", "12345678", "use")).uid;
  });

  async function report(warnings: string[], lang = "cimode") {
    return request(server).get("/ui/upload/report").query({ warnings })
      .set("Authorization", await bearer(creator))
      .set("Accept-Language", lang).expect(200).expect("Content-Type", /html/);
  }

  it("renders only the reported warnings and deduplicates shared advice", async function() {
    const { text } = await report(["png-images", "large-textures"]);
    expect(text).to.contain("modelWarnings.png-images");
    expect(text).to.contain("modelWarnings.large-textures");
    expect(text.match(/modelWarnings.recommend-optimize/g)).to.have.length(1);
    expect(text).not.to.contain("large-combined-diffuse-maps");
    expect(text).not.to.contain("recommend-reexport");
    expect(text).not.to.contain("<html");
  });

  it("recommends re-exporting for combined diffuse size", async function() {
    const { text } = await report(["large-combined-diffuse-maps"]);
    expect(text).to.contain("modelWarnings.recommend-reexport");
    expect(text).not.to.contain("recommend-optimize");
  });

  it("renders no report when there are no findings", async function() {
    expect((await report([])).text.trim()).to.equal("");
  });

  it("escapes unknown warning codes", async function() {
    const { text } = await report(['<img src=x onerror="alert(1)">']);
    expect(text).to.contain("&lt;img");
    expect(text).not.to.contain("<img");
    expect(text).not.to.contain("recommend-optimize");
  });

  it("localizes the same findings for English and French requests", async function() {
    const en = await report(["png-images"], "en");
    const fr = await report(["png-images"], "fr");
    for (const { text } of [en, fr]) {
      expect(text).to.contain('role="status"');
      expect(text).not.to.contain("modelWarnings.");
      expect(text).not.to.contain("png-images");
    }
    expect(fr.text).not.to.equal(en.text);
  });

  it("rejects structured values instead of codes", async function() {
    await request(server).get("/ui/upload/report?warnings[code]=png-images")
      .set("Authorization", await bearer(creator)).expect(400);
  });

  it("requires upload permission", async function() {
    await request(server).get("/ui/upload/report").expect(401);
    await request(server).get("/ui/upload/report")
      .set("Authorization", await bearer(reader)).expect(401);
  });
});

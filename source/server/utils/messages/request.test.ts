import express, { type Express } from "express";
import request from "supertest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BadRequestError } from "../errors.js";
import { errorHandlerMdw, notFoundHandlerMdw } from "../errorHandler.js";
import Templates from "../templates/index.js";
import { apiMessage } from "./index.js";

const templatesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../templates");

describe("API message language negotiation", function() {
  let app: Express;
  this.beforeEach(function() {
    app = express();
    const templates = new Templates({ dir: templatesDir, cache: false });
    app.engine(".hbs", templates.middleware);
    app.set("view engine", ".hbs");
    app.set("views", templates.dir);
    app.locals.config = { get: () => "" };
    app.use((req, _res, next) => {
      if (req.get("X-Session-Language")) req.session = { lang: req.get("X-Session-Language") };
      next();
    });
    app.get("/error", () => { throw new BadRequestError(); });
    app.get("/parameter", req => { throw new BadRequestError(apiMessage("tasks.unsupported-type", { type: String(req.query.type ?? "mesh") })); });
    app.get("/legacy", () => { throw new BadRequestError("legacy literal"); });
    app.get("/missing", () => { throw new BadRequestError(apiMessage("missing.english")); });
    app.use(errorHandlerMdw());
    app.use(notFoundHandlerMdw());
  });

  it("keeps curl-style JSON English without an explicit language, even with a French session", async function() {
    const { body } = await request(app).get("/error").set("X-Session-Language", "fr").expect(400);
    expect(body).to.include({ code: 400, messageCode: "http.bad-request", message: "Error: [400] Bad Request" });
  });

  it("localizes JSON for an explicit header and handles weighted regional languages", async function() {
    const response = await request(app).get("/error").set("Accept-Language", "de;q=1,fr-CA;q=0.9,en;q=0.2").expect(400);
    expect(response.body.message).to.equal("Error: [400] Requête incorrecte");
    expect(response.headers.vary).to.match(/Accept-Language/i);
  });

  it("lets the explicit query language override headers and the session", async function() {
    const { body } = await request(app).get("/error?lang=en").set("Accept-Language", "fr").set("X-Session-Language", "fr").expect(400);
    expect(body.message).to.equal("Error: [400] Bad Request");
  });

  it("defaults unsupported and wildcard language preferences to English", async function() {
    for (const language of ["de", "*", "en;q=0,fr;q=0"]) {
      const { body } = await request(app).get("/error").set("Accept-Language", language).expect(400);
      expect(body.message).to.equal("Error: [400] Bad Request");
    }
  });

  it("uses the saved UI language for HTML errors", async function() {
    const { text } = await request(app).get("/error").accept("html").set("X-Session-Language", "fr").expect(400);
    expect(text).to.contain("[400] Requête incorrecte");
    expect(text).to.contain('lang="fr"');
  });

  it("uses the same HTML language for translated messages and the page", async function() {
    const { text } = await request(app).get("/error?lang=en").accept("html").set("X-Session-Language", "fr").expect(400);
    expect(text).to.contain("[400] Bad Request");
    expect(text).to.contain('lang="en"');
  });

  it("localizes plain text only on request", async function() {
    await request(app).get("/error").accept("text").expect(400, "[400] Bad Request");
    await request(app).get("/error").accept("text").set("Accept-Language", "fr").expect(400, "[400] Requête incorrecte");
  });

  it("retains codes and parameters in JSON and escapes HTML parameters", async function() {
    const value = '<img src=x onerror="alert(1)">';
    const { body } = await request(app).get("/parameter").query({ type: value }).set("Accept-Language", "fr").expect(400);
    expect(body.messageCode).to.equal("tasks.unsupported-type");
    expect(body.messageParams).to.deep.equal({ type: value });
    expect(body.message).to.contain(value);
    const { text } = await request(app).get("/parameter").query({ type: value }).accept("html").set("Accept-Language", "fr").expect(400);
    expect(text).to.contain("&lt;img");
    expect(text).not.to.contain('<p class="message">[400] Type de tâche non pris en charge : <img');
  });

  it("keeps legacy literals readable during gradual migration", async function() {
    const { body } = await request(app).get("/legacy").set("Accept-Language", "fr").expect(400);
    expect(body).to.deep.equal({ code: 400, message: "Error: [400] legacy literal" });
  });

  it("reports unregistered English codes as loud server failures", async function() {
    const { body } = await request(app).get("/missing").set("Accept-Language", "fr").expect(500);
    expect(body.message).to.contain("Missing English API message: missing.english");
  });

  it("applies the policy to missing routes too", async function() {
    const en = await request(app).get("/no-such-route").expect(404);
    expect(en.body.message).to.equal("Not Found");
    const fr = await request(app).get("/no-such-route").set("Accept-Language", "fr").expect(404);
    expect(fr.body.message).to.equal("Ressource introuvable");
    expect(fr.body.messageCode).to.equal("http.not-found");
  });
});

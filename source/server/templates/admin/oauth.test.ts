import path from "path";
import { fileURLToPath } from "url";

import Templates from "../../utils/templates/index.js";

const templatesDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

describe("admin/oauth.hbs", function () {
  let t: Templates;
  this.beforeAll(function () {
    t = new Templates({ dir: templatesDir, cache: false });
  });

  function makeContext(overrides: any = {}) {
    return {
      lang: "cimode",
      layout: null,
      title: "OAuth clients",
      clients: [],
      ...overrides,
    };
  }

  it("renders an empty client list", async function () {
    const html = await t.render("admin/oauth.hbs", makeContext());
    expect(html).to.contain("labels.noClients");
    //the create form posts to the registration route
    expect(html).to.contain("/auth/oauth/clients");
  });

  it("lists a confidential client with a delete action scoped to its id", async function () {
    const clients = [{
      id: 12345,
      name: "My Service",
      redirectUris: ["https://app.example.com/callback"],
      confidential: true,
      created: "2024-06-15",
    }];
    const html = await t.render("admin/oauth.hbs", makeContext({ clients }));
    expect(html).to.contain("My Service");
    expect(html).to.contain("https://app.example.com/callback");
    expect(html).to.contain('action="/auth/oauth/clients/12345"');
    expect(html).to.contain("labels.confidentialClient");
  });

  it("labels public clients", async function () {
    const clients = [{
      id: 7,
      name: "CLI",
      redirectUris: ["http://localhost:1234/cb"],
      confidential: false,
      created: "2024-06-15",
    }];
    const html = await t.render("admin/oauth.hbs", makeContext({ clients }));
    expect(html).to.contain("labels.publicClient");
  });
});

import request from "supertest";

/** What's needed for the browser to follow a user's activity, from the navbar of any page */
describe("activity in the navbar", function() {
  let uid: number;

  this.beforeAll(async function() {
    const locals = await createIntegrationContext(this);
    uid = (await locals.userManager.addUser("bob", "12345678", "use")).uid;
  });

  function panelOf(text: string) {
    const match = /<div id="nav-notifications-panel"[^>]*>/.exec(text);
    expect(match, "the panel").to.be.ok;
    return match![0];
  }

  /** As the browser reads an attribute */
  function attribute(tag: string, name: string) {
    const value = new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
    return value?.replace(/&quot;/g, `"`).replace(/&#x27;/g, `'`).replace(/&#x3D;/g, "=").replace(/&amp;/g, "&");
  }

  it("shows the bell to users, with their activity's URL", async function() {
    const { text } = await request(this.server).get("/ui/tags/").set("Authorization", await bearer("bob")).expect(200);
    expect(text).to.contain(`data-activity="/users/${uid}/activity"`);
    expect(text).to.contain(`/dist/js/activity.js`);
  });

  it("isn't there for anonymous visitors", async function() {
    const { text } = await request(this.server).get("/ui/tags/").expect(200);
    expect(text).not.to.contain(`nav-notifications`);
    expect(text).not.to.contain(`/dist/js/activity.js`);
  });

  it("gives messages in the page's language, leaving the type to fill in", async function() {
    const { text } = await request(this.server).get("/ui/tags/")
      .set("Authorization", await bearer("bob"))
      .set("Accept-Language", "fr")
      .expect(200);
    const messages = JSON.parse(attribute(panelOf(text), "data-messages")!);
    expect(messages.task.default.success).to.equal("Tâche {{type}} terminée");
    expect(messages.task.createSceneFromFiles.error).to.equal("La création de la scène a échoué");
    expect(messages.default).to.be.a("string");
  });

  it("starts out loading, not saying there's nothing", async function() {
    const { text } = await request(this.server).get("/ui/tags/").set("Authorization", await bearer("bob")).expect(200);
    const loading = /<p class="nav-notifications-loading"[^>]*>/.exec(text)?.[0];
    const empty = /<p class="nav-notifications-empty"[^>]*>/.exec(text)?.[0];
    expect(loading, "the loading marker").to.be.ok;
    expect(loading).not.to.match(/\bhidden\b/);
    expect(empty, "the empty marker").to.match(/\bhidden\b/);
  });

  it("has a way to say it can't follow, that starts out hidden", async function() {
    const { text } = await request(this.server).get("/ui/tags/").set("Authorization", await bearer("bob")).expect(200);
    const offline = /<p class="nav-notifications-offline"[^>]*>(.*?)<\/p>/.exec(text);
    expect(offline, "the offline marker").to.be.ok;
    expect(offline![0]).to.match(/<p[^>]*\bhidden\b/);
    expect(offline![1]).to.contain("the latest notifications");
  });
});

import request from "supertest";

import { TaskScheduler } from "../../tasks/scheduler.js";


/** The pages of a user's account: the user's own, and anyone's for an admin, who sees them as that user does */
describe("GET /ui/users/:uid/*", function(){
  let tasks: TaskScheduler;
  let bob: number, alice: number, admin: number, manager: number;
  let bobsTask: number, alicesTask: number, bobsToken: number;

  const pages = ["/", "/groups", "/tokens", "/archives", "/tasks"];

  this.beforeAll(async function(){
    const {userManager, taskScheduler, vfs} = await createIntegrationContext(this);
    tasks = taskScheduler;
    bob = (await userManager.addUser("bob", "12345678", "create", "bob@example.com")).uid;
    alice = (await userManager.addUser("alice", "12345678", "create", "alice@example.com")).uid;
    admin = (await userManager.addUser("admin", "12345678", "admin", "admin@example.com")).uid;
    manager = (await userManager.addUser("manager", "12345678", "manage")).uid;

    await userManager.addGroup("bobs-group");
    await userManager.addMemberToGroup(bob, "bobs-group");
    await userManager.addGroup("alices-group");
    await userManager.addMemberToGroup(alice, "alices-group");

    bobsToken = (await userManager.createToken(bob, {name: "bobs-token"})).meta.id;
    await userManager.createToken(alice, {name: "alices-token"});

    await vfs.createScene("bobs-scene", bob);
    await vfs.archiveScene("bobs-scene");
    await vfs.createScene("alices-scene", alice);
    await vfs.archiveScene("alices-scene");

    bobsTask = (await tasks.create({type: "testTask", data: {}, user_id: bob})).task_id;
    alicesTask = (await tasks.create({type: "testTask", data: {}, user_id: alice})).task_id;
  });

  async function page(this: Mocha.Context, path: string, as: string){
    const {text} = await request(this.server).get(path)
      .set("Authorization", await bearer(as))
      .expect(200);
    return text;
  }

  /** The tabs of the page's layout, as their links */
  const tabsOf = (text: string)=> [...(/<nav id="user-profile-select">(.*?)<\/nav>/s.exec(text)?.[1] ?? "").matchAll(/href="([^"]*)"/g)].map(m=> m[1]);
  /** The page's main title */
  const headingOf = (text: string)=> /<h1 class="grid-header">(.*?)<\/h1>/s.exec(text)?.[1].trim();

  describe("access", function(){
    for(const p of pages){
      it(`sends visitors to log in, and back, from ${p}`, async function(){
        const path = `/ui/users/${bob}${p}?foo=bar`;
        await request(this.server).get(path)
          .expect(302)
          .expect("Location", `/auth/login?redirect=${encodeURIComponent(path)}`);
      });

      it(`is the user's own ${p}`, async function(){
        await page.call(this, `/ui/users/${bob}${p}`, "bob");
      });

      it(`isn't another user's ${p}`, async function(){
        const {text} = await request(this.server).get(`/ui/users/${bob}${p}`)
          .set("Authorization", await bearer("alice"))
          .expect(401);
        expect(text).not.to.contain("bob@example.com");
      });

      it(`is anyone's ${p} for an admin`, async function(){
        await page.call(this, `/ui/users/${bob}${p}`, "admin");
      });
    }

    it("is not found for a user that doesn't exist", async function(){
      await request(this.server).get(`/ui/users/${admin + 1000}/`)
        .set("Authorization", await bearer("admin"))
        .expect(404);
    });

    it("needs a user's id", async function(){
      await request(this.server).get(`/ui/users/bob/`)
        .set("Authorization", await bearer("admin"))
        .expect(404);
    });
  });

  describe("/ui/user/*", function(){
    it("is where the user's own pages were", async function(){
      for(const [from, to] of [
        ["/ui/user", `/ui/users/${bob}/`],
        ["/ui/user/", `/ui/users/${bob}/`],
        ["/ui/user/tokens?personal=true", `/ui/users/${bob}/tokens?personal=true`],
        ["/ui/user/tasks", `/ui/users/${bob}/tasks`],
      ]){
        await request(this.server).get(from)
          .set("Authorization", await bearer("bob"))
          .expect(302)
          .expect("Location", to);
      }
    });

    it("sends visitors to log in, and back", async function(){
      await request(this.server).get("/ui/user/tasks")
        .expect(302)
        .expect("Location", `/auth/login?redirect=${encodeURIComponent("/ui/user/tasks")}`);
    });
  });

  describe("for the user", function(){
    it("has tabs to all the user's pages", async function(){
      const text = await page.call(this, `/ui/users/${bob}/`, "bob");
      expect(tabsOf(text)).to.deep.equal([
        `/ui/users/${bob}/`,
        `/ui/users/${bob}/groups`,
        `/ui/users/${bob}/tokens`,
        `/ui/users/${bob}/archives`,
        `/ui/users/${bob}/tasks`,
        `/ui/users/${bob}/notifications`,
      ]);
      expect(headingOf(text)).to.equal("User Settings");
    });

    it("links to them from the navbar", async function(){
      const text = await page.call(this, "/ui/tags", "bob");
      expect(text).to.match(new RegExp(`<a class="[^"]*nav-user[^"]*" href="/ui/users/${bob}/"`));
    });

    it("has the user's settings, and logging out", async function(){
      const text = await page.call(this, `/ui/users/${bob}/`, "bob");
      expect(text).to.contain(`action="/users/${bob}"`);
      expect(text).to.contain(`value="bob@example.com"`);
      expect(text).to.contain(`id="user-logout"`);
    });

    it("has the user's tokens, to make more and revoke them", async function(){
      const text = await page.call(this, `/ui/users/${bob}/tokens`, "bob");
      expect(text).to.contain("bobs-token");
      expect(text).not.to.contain("alices-token");
      expect(text).to.contain(`id="token-create"`);
      expect(text).to.contain(`data-revoke="/auth/tokens/${bobsToken}"`);
      expect(text).to.contain(`class="user-grants"`);
    });

    for(const p of pages){
      it(`doesn't warn the user that ${p} is someone else's`, async function(){
        const text = await page.call(this, `/ui/users/${bob}${p}`, "bob");
        expect(text).not.to.contain("help-block-warning");
      });
    }
  });

  describe("for an admin", function(){
    /** The warning that the account is someone else's, as its text */
    const warningOf = (text: string)=> /<aside class="help-block help-block-warning"[^>]*>(.*?)<\/aside>/s.exec(text)?.[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").replace(/&#x27;/g, "'").trim();

    for(const p of ["/", "/tokens"]){
      it(`warns that changes to ${p} are the user's, not the admin's`, async function(){
        const text = await page.call(this, `/ui/users/${bob}${p}`, "admin");
        expect(warningOf(text)).to.match(/^This is bob's account, not yours .*changed for bob/);
      });
    }

    for(const p of ["/groups", "/archives", "/tasks"]){
      it(`doesn't warn on ${p}, where the title says whose it is`, async function(){
        const text = await page.call(this, `/ui/users/${bob}${p}`, "admin");
        expect(text).not.to.contain("help-block-warning");
        expect(headingOf(text)).to.equal("User Settings — bob");
      });
    }

    it("says whose pages they are", async function(){
      const text = await page.call(this, `/ui/users/${bob}/`, "admin");
      expect(headingOf(text)).to.equal("User Settings — bob");
      expect(text).to.contain("<title>Settings — bob");
    });

    it("has tabs to the user's pages, but not their notifications", async function(){
      const text = await page.call(this, `/ui/users/${bob}/tasks`, "admin");
      expect(tabsOf(text)).to.deep.equal([
        `/ui/users/${bob}/`,
        `/ui/users/${bob}/groups`,
        `/ui/users/${bob}/tokens`,
        `/ui/users/${bob}/archives`,
        `/ui/users/${bob}/tasks`,
      ]);
    });

    it("has the user's settings, but logging out is the admin's", async function(){
      const text = await page.call(this, `/ui/users/${bob}/`, "admin");
      expect(text).to.contain(`action="/users/${bob}"`);
      expect(text).to.contain(`value="bob@example.com"`);
      expect(text).not.to.contain("admin@example.com");
      expect(text).not.to.contain(`id="user-logout"`);
    });

    it("has the user's groups", async function(){
      const text = await page.call(this, `/ui/users/${bob}/groups`, "admin");
      expect(text).to.contain(`href="/ui/groups/bobs-group"`);
      expect(text).not.to.contain("alices-group");
    });

    it("has the user's tokens to revoke, but neither making them nor the user's apps", async function(){
      const text = await page.call(this, `/ui/users/${bob}/tokens`, "admin");
      expect(text).to.contain("bobs-token");
      expect(text).not.to.contain("alices-token");
      expect(text).to.contain(`data-revoke="/users/${bob}/tokens/${bobsToken}"`);
      expect(text).not.to.contain(`id="token-create"`);
      expect(text).not.to.contain(`class="user-grants"`);
    });

    it("has the user's archives", async function(){
      const text = await page.call(this, `/ui/users/${bob}/archives`, "admin");
      expect(text).to.contain("bobs-scene");
      expect(text).not.to.contain("alices-scene");
    });

    it("is linked from the list of users", async function(){
      const text = await page.call(this, "/ui/admin/users", "admin");
      expect(text).to.contain(`<a href="/ui/users/${bob}/">bob</a>`);
    });

    it("isn't linked from the list of users for a manager, who can't see it", async function(){
      const {text} = await request(this.server).get("/ui/admin/users")
        .set("Authorization", await bearer(manager))
        .expect(200);
      expect(text).to.contain(">bob</td>");
      expect(text).not.to.contain(`href="/ui/users/${bob}/"`);
    });

    it("has the user's tasks", async function(){
      const text = await page.call(this, `/ui/users/${bob}/tasks`, "admin");
      expect(text).to.contain(`href="/ui/tasks/${bobsTask}"`);
      expect(text).not.to.contain(`href="/ui/tasks/${alicesTask}"`);
    });
  });
});

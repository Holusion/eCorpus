import request from "supertest";

import { NotificationManager } from "../../notifications/manager.js";
import { TaskScheduler } from "../../tasks/scheduler.js";


/** All of a user's notifications, a page at a time: what small screens get instead of the bell's panel */
describe("GET /ui/user/notifications", function(){
  let tasks: TaskScheduler, hub: NotificationManager;
  let uid: number, other: number;

  this.beforeAll(async function(){
    const locals = await createIntegrationContext(this);
    tasks = locals.taskScheduler;
    hub = locals.notifications;
    uid = (await locals.userManager.addUser("bob", "12345678", "use")).uid;
    other = (await locals.userManager.addUser("alice", "12345678", "use")).uid;
  });

  this.beforeEach(async function(){
    await tasks.db.run(`DELETE FROM notifications`);
  });

  /** A notified task of `uid`, settled unless told otherwise */
  async function notified(user_id = uid, {status = "success", read = false}: {status?: "success"|"error"|"running", read?: boolean} = {}){
    const task = await tasks.create({type: "testTask", data: {}, user_id});
    await hub.notify(task);
    if(status === "success") await tasks.releaseTask(task.task_id, null);
    else if(status === "error") await tasks.errorTask(task.task_id, "Failed");
    else await tasks.db.run(`UPDATE tasks SET status = 'running' WHERE task_id = $1`, [task.task_id]);
    if(read) await tasks.db.run(`UPDATE notifications SET read = true WHERE fk_task_id = $1`, [task.task_id]);
    return task.task_id;
  }

  async function page(this: Mocha.Context, query = ""){
    const {text} = await request(this.server).get(`/ui/user/notifications${query}`)
      .set("Authorization", await bearer("bob"))
      .expect(200);
    return text;
  }

  /** The lines of the list, as `{id, state, task}`, in their order */
  function linesOf(text: string){
    return [...text.matchAll(/<li class="(\w+)" data-notification-id="(\d+)">.*?<\/li>/gs)].map(([line, state, id])=>({
      id: parseInt(id, 10),
      state,
      task: parseInt(/href="\/ui\/tasks\/(\d+)"/.exec(line)?.[1] ?? "NaN", 10),
      markable: line.includes("notifications-mark-read"),
    }));
  }

  it("sends visitors to the login page", async function(){
    await request(this.server).get("/ui/user/notifications")
      .expect(302)
      .expect("Location", /^\/auth\/login/);
  });

  it("has the user's notifications, read or not, newest first", async function(){
    const read = await notified(uid, {read: true});
    const failed = await notified(uid, {status: "error"});
    const running = await notified(uid, {status: "running"});
    await notified(other);
    const lines = linesOf(await page.call(this));
    expect(lines.map(l=> [l.task, l.state])).to.deep.equal([
      [running, "running"],
      [failed, "unread"],
      [read, "read"],
    ]);
    //Only what's settled can be marked
    expect(lines.map(l=> l.markable)).to.deep.equal([false, true, false]);
  });

  it("says what they're about in the page's language", async function(){
    await notified(uid, {status: "error"});
    const {text} = await request(this.server).get("/ui/user/notifications")
      .set("Authorization", await bearer("bob"))
      .set("Accept-Language", "fr")
      .expect(200);
    expect(text).to.contain("La tâche testTask a échoué");
  });

  it("can leave out what's been read", async function(){
    await notified(uid, {read: true});
    const unread = await notified(uid);
    const text = await page.call(this, "?unread=true");
    expect(linesOf(text).map(l=> l.task)).to.deep.equal([unread]);
    //For what gets read to leave it
    expect(text).to.match(/<ul [^>]*data-unread-only/);
    expect(await page.call(this)).not.to.contain("data-unread-only");
  });

  it("has 20 per page, with a way to the next ones", async function(){
    const ids: number[] = [];
    for(let i = 0; i < 25; i++) ids.push(await notified());
    const first = await page.call(this);
    expect(linesOf(first).map(l=> l.task)).to.deep.equal(ids.slice(-20).reverse());
    expect(first).to.contain(`href="/ui/user/notifications?offset&#x3D;20"`);

    const second = await page.call(this, "?offset=20");
    expect(linesOf(second).map(l=> l.task)).to.deep.equal(ids.slice(0, 5).reverse());
    expect(second).to.contain(`href="/ui/user/notifications?offset&#x3D;0"`);
    expect(second).not.to.contain(`offset&#x3D;40`);
  });

  it("has no pages when they all fit", async function(){
    for(let i = 0; i < 20; i++) await notified();
    const text = await page.call(this);
    expect(linesOf(text)).to.have.length(20);
    expect(text).not.to.contain(`offset&#x3D;`);
  });

  it("says when there are none", async function(){
    const text = await page.call(this);
    expect(linesOf(text)).to.deep.equal([]);
    expect(text).to.contain("No notifications.");
  });

  it("is linked from the bell, its panel, and the user's pages", async function(){
    const text = await page.call(this);
    expect(text).to.match(/<a id="nav-notifications"[^>]* href="\/ui\/user\/notifications"/);
    expect(text.match(/href="\/ui\/user\/notifications"/g)).to.have.length(3);
  });
});

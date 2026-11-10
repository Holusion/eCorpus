import request from "supertest";
import { localize } from "../../utils/i18n.js";
import { BadRequestError } from "../../utils/errors.js";
import { TaskScheduler } from "../../tasks/scheduler.js";
import { NotificationManager } from "../../notifications/manager.js";
import Vfs from "../../vfs/index.js";

/** What's started from the upload page shows there, as notifications, until they've been read */
describe("GET /ui/upload", function() {
  let taskScheduler: TaskScheduler, hub: NotificationManager, vfs: Vfs;
  let uploader: number, other: number;

  this.beforeAll(async function() {
    const locals = await createIntegrationContext(this);
    taskScheduler = locals.taskScheduler;
    hub = locals.notifications;
    vfs = locals.vfs;
    uploader = (await locals.userManager.addUser("uploader", "12345678", "create")).uid;
    other = (await locals.userManager.addUser("other", "12345678", "create")).uid;
  });

  this.beforeEach(async function(){
    await taskScheduler.db.run(`DELETE FROM notifications`);
  });

  type Settle = {status: "running"} | {status: "success", output: unknown} | {status: "error", error: Error};

  /** A notified task of the uploader's, as the upload page starts them */
  async function started(type: string, settle: Settle, {user_id = uploader, read = false} = {}){
    const task = await taskScheduler.create({ scene_id: null, user_id, type, data: {} });
    await hub.notify(task);
    if(settle.status === "success") await taskScheduler.releaseTask(task.task_id, settle.output as any);
    else if(settle.status === "error") await taskScheduler.errorTask(task.task_id, settle.error);
    else await taskScheduler.db.run(`UPDATE tasks SET status = 'running' WHERE task_id = $1`, [task.task_id]);
    if(read) await taskScheduler.db.run(`UPDATE notifications SET read = true WHERE fk_task_id = $1`, [task.task_id]);
    return task.task_id;
  }

  async function page(this: Mocha.Context, lang = "en"){
    const { text } = await request(this.server).get("/ui/upload")
      .set("Authorization", await bearer("uploader"))
      .set("Accept-Language", lang)
      .expect(200);
    return text;
  }

  /** The lines of the list, as `{task, state}`, in their order */
  function linesOf(text: string){
    return [...text.matchAll(/<li class="(\w+)" data-notification-id="\d+">.*?href="\/ui\/tasks\/(\d+)"/gs)].map(([, state, task])=>({
      task: parseInt(task, 10),
      state,
    }));
  }

  it("has what's been started, until it's been read", async function() {
    const read = await started("createSceneFromFiles", {status: "success", output: 0}, {read: true});
    const failed = await started("extractScenesArchives", {status: "error", error: new Error("Failed")});
    const running = await started("createSceneFromFiles", {status: "running"});
    //Not from here
    await started("testTask", {status: "running"});
    await started("createSceneFromFiles", {status: "running"}, {user_id: other});
    const text = await page.call(this);
    expect(linesOf(text)).to.deep.equal([
      {task: running, state: "running"},
      {task: failed, state: "unread"},
    ]);
    expect(linesOf(text).map(l=> l.task)).not.to.include(read);
    //What it follows, for what's started from there
    expect(text).to.match(/<ul [^>]*data-follow="createSceneFromFiles extractScenesArchives"/);
    expect(text).to.match(/<section [^>]*aria-labelledby="createdScenes-heading">/);
  });

  it("is there, out of sight, when there's nothing", async function() {
    const text = await page.call(this);
    expect(linesOf(text)).to.deep.equal([]);
    expect(text).to.match(/<section [^>]*aria-labelledby="createdScenes-heading" hidden>/);
    expect(text).to.contain("data-notifications");
  });

  it("links to the scene that was made", async function() {
    const scene_id = await vfs.createScene("made-from-files", uploader);
    await vfs.writeDoc(`{"id":1}`, {scene: scene_id, user_id: uploader, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
    await started("createSceneFromFiles", {status: "success", output: scene_id});
    const text = await page.call(this);
    expect(text).to.contain(`href="/ui/scenes/made-from-files"`);
    expect(text).to.contain(`href="/ui/scenes/made-from-files/view"`);
    expect(text).to.contain(`href="/ui/scenes/made-from-files/edit"`);
  });

  it("has a line for each scene of an archive, after the import's, leaving out those that are gone", async function() {
    await vfs.createScene("from-archive", uploader);
    const updated = await vfs.createScene("updated-from-archive", uploader);
    await vfs.writeDoc(`{"id":1}`, {scene: updated, user_id: uploader, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
    const task = await started("extractScenesArchives", {status: "success", output: [
      {name: "from-archive", action: "create"},
      {name: "gone-since", action: "update"},
      {name: "updated-from-archive", action: "update"},
    ]});
    const text = await page.call(this);
    const lines = [...text.matchAll(/<li class="(\w+)" data-notification-id="(\d+)"( data-part="scene")?>(.*?)<\/li>\s*(?=<li class|<\/ul>\s*<\/section>)/gs)];
    //All of them for the same notification, the import's first
    expect(new Set(lines.map(([, , id])=> id)).size).to.equal(1);
    expect(lines.map(([, state, , part])=> [state, !!part])).to.deep.equal([
      ["unread", false],
      ["unread", true],
      ["unread", true],
    ]);
    const [importLine, created, update] = lines.map(([, , , , content])=> content);
    expect(importLine).to.contain(`href="/ui/tasks/${task}"`);
    expect(importLine).to.contain(`Archive imported`);
    //Only the import's can be marked: they're read together
    expect(importLine).to.contain(`notifications-mark-read`);
    expect(created).not.to.contain(`notifications-mark-read`);
    expect(created).to.contain(`>from-archive</a>`);
    expect(created).to.contain(`>Created</span>`);
    expect(created).to.contain(`href="/ui/scenes/from-archive"`);
    expect(created).to.contain(`href="/ui/scenes/from-archive/view"`);
    //Not a voyager scene
    expect(created).not.to.contain(`/edit"`);
    expect(update).to.contain(`>updated-from-archive</a>`);
    expect(update).to.contain(`>Updated</span>`);
    expect(update).to.contain(`href="/ui/scenes/updated-from-archive/edit"`);
    expect(text).not.to.contain(`gone-since`);
  });

  it("translates errors of failed upload tasks", async function() {
    await started("createSceneFromFiles", {status: "error", error: new BadRequestError(localize("errors.upload.notGlb", { filename: "foo.glb" }))});
    const text = await page.call(this, "fr");
    expect(text).to.contain("La création de la scène a échoué");
    expect(text).to.contain(`<p class="notifications-detail">foo.glb ne semble pas être un fichier GLB</p>`);
    //Only the message
    expect(text).not.to.contain("[400]");
  });
});

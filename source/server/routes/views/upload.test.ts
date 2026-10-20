import request from "supertest";
import { localize } from "../../utils/i18n.js";
import { BadRequestError } from "../../utils/errors.js";
import { TaskScheduler } from "../../tasks/scheduler.js";

describe("GET /ui/upload", function() {
  let taskScheduler: TaskScheduler;
  let uploader: number;

  this.beforeAll(async function() {
    const locals = await createIntegrationContext(this);
    taskScheduler = locals.taskScheduler;
    uploader = (await locals.userManager.addUser("uploader", "12345678", "create")).uid;
  });

  it("translates errors of failed upload tasks", async function() {
    const task = await taskScheduler.create({ scene_id: null, user_id: uploader, type: "createSceneFromFiles", data: {} });
    await taskScheduler.errorTask(task.task_id, new BadRequestError(localize("errors.upload.notGlb", { filename: "foo.glb" })));
    const { text } = await request(this.server).get("/ui/upload").query({ task: task.task_id })
      .set("Authorization", await bearer("uploader"))
      .set("Accept-Language", "fr")
      .expect(200);
    expect(text).to.contain("[400] foo.glb ne semble pas être un fichier GLB");
  });
});

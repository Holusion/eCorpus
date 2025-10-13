

// Tests for tasks management
// The system is a bit intricate and hard to test in isolation

import { Client } from "pg";
import openDatabase, { Database } from "../vfs/helpers/db.js";
import { TaskProcessor } from "./processor.js";
import { TaskScheduler } from "./scheduler.js";
import { once } from "node:events";
import { Uid } from "../utils/uid.js";
import { randomBytes } from "node:crypto";
import { TaskListener } from "./listener.js";
import { NotFoundError } from "../utils/errors.js";

// So it's mostly integration tests
describe("TaskListener", function(){
  let db_uri: string, scene_id: number, handle: Database, client: Client;

    let listener :TaskListener;
  this.beforeAll(async function(){
    db_uri = await getUniqueDb(this.currentTest?.title.replace(/[^\w]/g, "_"));
    handle = await openDatabase({uri: db_uri});
    let s = await handle.get(
      "INSERT INTO scenes(scene_id, scene_name) VALUES ( $1, $2 ) RETURNING scene_id",
    [Uid.make(), randomBytes(8).toString("base64url")]);
    scene_id = s.scene_id;
  });

  this.afterAll(async function(){
    await handle?.end();
    await dropDb(db_uri);
  });

  this.beforeEach(async function(){
    await handle.run(`DELETE FROM tasks_relations`);
    await Promise.all([
      handle.run(`DELETE FROM tasks`),
      handle.run(`DELETE FROM tasks_logs`),
    ]);
    
    client = new Client({connectionString: db_uri});
    await client.connect();
    listener = new TaskListener({client});
  })
  this.afterEach(async function(){
    await client.end();
  });


  //Non-connected functions that should work well in isolation
  it("create tasks", async function(){
    let task = await listener.create(scene_id, null,  {type: "delayTask", data: {time: 0}});
    expect(task).to.be.a("number");
    expect(await handle.all("SELECT * FROM tasks")).to.have.length(1);
  });


  it("update task status", async function(){
    let t = await listener.create(scene_id, null, {type: "delayTask", data: {time: 0}});
    expect(await handle.get("SELECT * FROM tasks")).to.have.property("status", "pending");
    await listener.setTaskStatus(t, "success");
    expect(await handle.get("SELECT * FROM tasks")).to.have.property("status", "success");
  });

  it("resolve task", async function(){
    //Create a task with a parent
    let t1 = await listener.create(scene_id, null,  {type: "delayTask", data: {time: 0}});
    let t2 = await listener.createChild(t1,  {type: "delayTask", data: {time: 0}, after: [t1]});
    
    let resolved = await listener.getTask(t2);
    expect(resolved.after).to.deep.equal([t1]);
  });
});
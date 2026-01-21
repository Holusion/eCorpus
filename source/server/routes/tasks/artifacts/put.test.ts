
import request from "supertest";

import User from "../../../auth/User.js";
import UserManager from "../../../auth/UserManager.js";
import Vfs from "../../../vfs/index.js";
import { randomBytes, randomInt } from "node:crypto";





describe("PUT /tasks/artifacts/:id", function(){
  let vfs :Vfs, userManager :UserManager, user :User, admin :User;
  let filename: string, size: number, task: number;

  this.beforeAll(async function(){
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager = locals.userManager;
    user = await userManager.addUser("bob", "12345678");
    admin = await userManager.addUser("alice", "12345678", "admin");
  });

  this.afterAll(async function(){
    await cleanIntegrationContext(this);
  });

  this.beforeEach(async function(){
      filename = randomBytes(4).toString("hex")+".bin";
      size = randomInt(16, 512);
      const {body} = await request(this.server).post(`/tasks`)
      .auth("alice", "12345678")
      .set("Content-Type", "application/json")
      .send({filename, size})
      .expect(200);
      expect(body).to.have.property("task");
      task = body.task;
      expect(task).to.be.a("number");
  });

  it("Can handle a single-chunk upload (no headers)", async function(){
    const data = randomBytes(size);
    await request(this.server).put(`/tasks/artifacts/${task}`)
    .auth("alice", "12345678")
    .send(data)
    .expect(201);

    const {body} = await request(this.server).get(`/tasks/artifacts/${task}`)
    .auth("alice", "12345678")
    .expect(200);

    expect(body.toString("hex")).to.equal(data.toString("hex"));
  });

  it("Can handle a single-chunk upload (chunk headers)", async function(){
    const data = randomBytes(size);
    await request(this.server).put(`/tasks/artifacts/${task}`)
    .auth("alice", "12345678")
    .set("Content-Length", size.toString())
    .set("Content-Range", `bytes 0-${size-1 /*end is inclusive*/}/${size}`)
    .send(data)
    .expect(201);

    const {body} = await request(this.server).get(`/tasks/artifacts/${task}`)
    .auth("alice", "12345678")
    .expect(200);

    expect(body.toString("hex")).to.equal(data.toString("hex"));
  });

  it("Can handle a multi-chunk upload", async function(){
    const data = randomBytes(size);

    let offset = 0;
    let chunkSize = Math.floor(size / 4);
    while(offset < size){
      const len = Math.min(size - offset, chunkSize);
      await request(this.server).put(`/tasks/artifacts/${task}`)
      .auth("alice", "12345678")
      .set("Content-Length", len.toString())
      .set("Content-Range", `bytes ${offset}-${offset+len-1 /*end is inclusive*/}/${size}`)
      .send(data.subarray(offset, offset + len))
      .expect(offset + len < size? 206 : 201);
      offset += len;
    }

    const {body} = await request(this.server).get(`/tasks/artifacts/${task}`)
    .auth("alice", "12345678")
    .expect(200);

    expect(body.toString("hex")).to.equal(data.toString("hex"));
  });

  it("can parse uploaded contents (simple)", async function(){
    const data = randomBytes(size);
    await request(this.server).put(`/tasks/artifacts/${task}`)
    .auth("alice", "12345678")
    .send(data)
    .expect(201);

    const {body} = await request(this.server).get(`/tasks/task/${task}`)
    .auth("alice", "12345678")
    .expect(200);

    expect(body).to.have.property("status", "success");
    expect(body).to.have.property("output").to.deep.equal({
      filepath: `artifacts/${task}/${filename}`,
      files: [filename],
      scenes: [],
    });
  });

  it("rejects out-of-order bytes", async function(){
    const data = randomBytes(6);
    console.log()
    const res = await request(this.server).put(`/tasks/artifacts/${task}`)
      .auth("alice", "12345678")
      .set("Content-Length", '6')
      .set("Content-Range", `bytes 10-15/${size}`)
      .send(data)
      .expect(416);
    expect(res.body).to.have.property("message", `HTTPError: [416] Missing bytes 0-10`);
  });
})
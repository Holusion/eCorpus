import request from "supertest";
import { randomBytes } from "node:crypto";

import UserManager from "../../../auth/UserManager.js";


describe("DELETE /uploads/:id/files/*path", function(){
  let userManager :UserManager;
  let task: number;

  this.beforeAll(async function(){
    let locals = await createIntegrationContext(this);
    userManager = locals.userManager;
    await userManager.addUser("alice", "12345678", "admin");
    await userManager.addUser("bob", "12345678");
  });

  this.beforeEach(async function(){
    const {body} = await request(this.server).post("/uploads")
    .set("Authorization", await bearer("alice"))
    .send({})
    .expect(201);
    task = body.task_id;
  });

  async function put(ctx: Mocha.Context, filepath: string, data: Buffer, range?: string){
    const req = request(ctx.server).put(`/uploads/${task}/files/${filepath}`)
    .set("Authorization", await bearer("alice"));
    if(range) req.set("Content-Range", range);
    return await req.send(data);
  }

  function head(ctx: Mocha.Context, filepath: string){
    return bearer("alice").then(auth=>request(ctx.server).head(`/uploads/${task}/files/${filepath}`).set("Authorization", auth));
  }

  it("removes a complete file", async function(){
    await put(this, "tex/foo.bin", randomBytes(16)).then(res=>expect(res.status).to.equal(201));
    await request(this.server).delete(`/uploads/${task}/files/tex/foo.bin`)
    .set("Authorization", await bearer("alice"))
    .expect(204);
    await head(this, "tex/foo.bin").then(res=>expect(res.status).to.equal(404));
  });

  it("removes a file that's being received", async function(){
    await put(this, "foo.bin", randomBytes(8), "bytes 0-7/16").then(res=>expect(res.status).to.equal(206));
    await request(this.server).delete(`/uploads/${task}/files/foo.bin`)
    .set("Authorization", await bearer("alice"))
    .expect(204);
    await head(this, "foo.bin").then(res=>expect(res.status).to.equal(404));
  });

  it("lets the upload be processed without it", async function(){
    await put(this, "foo.bin", randomBytes(16)).then(res=>expect(res.status).to.equal(201));
    //Incomplete: it would prevent processing
    await put(this, "bar.bin", randomBytes(8), "bytes 0-7/16").then(res=>expect(res.status).to.equal(206));
    await request(this.server).delete(`/uploads/${task}/files/bar.bin`)
    .set("Authorization", await bearer("alice"))
    .expect(204);
    await request(this.server).post(`/uploads/${task}/process`)
    .set("Authorization", await bearer("alice"))
    .send({main: "foo.bin"})
    .expect(200);
  });

  describe("rejects", function(){
    it("a file that's not in the upload", async function(){
      await put(this, "tex/foo.bin", randomBytes(16));
      for(const p of ["bar.bin", "tex"]){
        await request(this.server).delete(`/uploads/${task}/files/${p}`)
        .set("Authorization", await bearer("alice"))
        .expect(404);
      }
      await head(this, "tex/foo.bin").then(res=>expect(res.status).to.equal(200));
    });

    it("a path outside of the upload", async function(){
      await request(this.server).delete(`/uploads/${task}/files/..%2F..%2Ffoo.bin`)
      .set("Authorization", await bearer("alice"))
      .expect(400);
    });

    it("a processed upload", async function(){
      await put(this, "foo.bin", randomBytes(16));
      await request(this.server).post(`/uploads/${task}/process`)
      .set("Authorization", await bearer("alice"))
      .send({main: "foo.bin"})
      .expect(200);
      await request(this.server).delete(`/uploads/${task}/files/foo.bin`)
      .set("Authorization", await bearer("alice"))
      .expect(409);
    });

    it("other users", async function(){
      await put(this, "foo.bin", randomBytes(16));
      await request(this.server).delete(`/uploads/${task}/files/foo.bin`)
      .set("Authorization", await bearer("bob"))
      .expect(401);
      await head(this, "foo.bin").then(res=>expect(res.status).to.equal(200));
    });
  });
});

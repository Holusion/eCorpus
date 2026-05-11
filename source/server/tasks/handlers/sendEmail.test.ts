import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import nodemailer from "nodemailer";

import openDatabase, { Database } from "../../vfs/helpers/db.js";
import Vfs from "../../vfs/index.js";
import UserManager from "../../auth/UserManager.js";
import { Config } from "../../utils/config.js";
import { TaskScheduler } from "../scheduler.js";
import { setTransporter } from "../../utils/mails/send.js";
import { sendEmail } from "./sendEmail.js";


describe("sendEmail task handler", function () {
  let db_uri: string, handle: Database;
  let scheduler: TaskScheduler;
  let vfs: Vfs;
  let config: Config;
  let rootDir: string;

  this.beforeAll(async function () {
    db_uri = await getUniqueDb("ecorpus_sendmail_handler");
    handle = await openDatabase({ uri: db_uri });
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "ecorpus-sendmail-"));
    vfs = await Vfs.Open(rootDir, { db: handle, forceMigration: false });
    config = await Config.open(handle, {});
  });

  this.afterAll(async function () {
    Config.close();
    await handle?.end();
    if (rootDir) await fs.rm(rootDir, { recursive: true, force: true });
    if (db_uri) await dropDb(db_uri);
    setTransporter(undefined);
  });

  this.beforeEach(async function () {
    const userManager = new UserManager(handle);
    scheduler = new TaskScheduler({ db: handle, vfs, userManager, config });
  });

  this.afterEach(async function () {
    await handle.run(`DELETE FROM tasks_logs`);
    await handle.run(`DELETE FROM tasks`);
    if (!scheduler.closed) await scheduler.close();
    setTransporter(undefined);
  });

  it("delivers the email and resolves to SMTP info", async function () {
    setTransporter(nodemailer.createTransport({ jsonTransport: true }));

    const out = await scheduler.run({
      handler: sendEmail,
      data: {
        to: "alice@example.com",
        subject: "Hello",
        html: "<p>Hi</p>",
      },
    });

    expect(out).to.have.property("accepted").that.deep.equals(["alice@example.com"]);
    expect(out).to.have.property("messageId").a("string");
  });

  it("records the task as success with persisted log lines", async function () {
    setTransporter(nodemailer.createTransport({ jsonTransport: true }));

    await scheduler.run({
      handler: sendEmail,
      data: { to: "bob@example.com", subject: "Hi", html: "<p>hello</p>" },
    });

    const tasks = await scheduler.getTasks({ type: "sendEmail", status: "success" });
    expect(tasks).to.have.length.at.least(1);
    const last = tasks[0];
    expect(last).to.have.property("status", "success");

    const logs = await scheduler.getLogs(last.task_id);
    const messages = logs.map(l => l.message);
    expect(messages.some(m => /Sending email to bob@example.com/.test(m)),
      `expected a "Sending email" log line, got: ${messages.join(" | ")}`).to.equal(true);
    expect(messages.some(m => /Delivered to bob@example.com/.test(m)),
      `expected a "Delivered to" log line, got: ${messages.join(" | ")}`).to.equal(true);
  });

  it("marks the task as error when SMTP fails", async function () {
    const failing = {
      sendMail: async () => { throw new Error("boom"); },
    } as unknown as nodemailer.Transporter;
    setTransporter(failing);

    await expect(scheduler.run({
      handler: sendEmail,
      data: { to: "carol@example.com", subject: "Hi", html: "<p>hello</p>" },
    })).to.be.rejectedWith(/boom/);

    const tasks = await scheduler.getTasks({ type: "sendEmail", status: "error" });
    expect(tasks).to.have.length.at.least(1);
    expect(tasks[0]).to.have.property("status", "error");
  });
});

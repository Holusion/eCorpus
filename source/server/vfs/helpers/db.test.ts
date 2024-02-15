import fs from "fs/promises";
import os from "os";
import timers from "timers/promises";
import { expect } from "chai";
import open, { Database } from "./db.js";
import path from "path";
import { fileURLToPath } from 'url';
import uid from "../../utils/uid.js";
import Vfs from "../index.js";

const thisDir = path.dirname(fileURLToPath(import.meta.url));

describe("Database", function(){
  let db :Database;
  this.beforeEach(async function(){
    db = await open({
      filename: path.join(os.tmpdir(),`${(this.currentTest as any).title.replace(/[^a-zA-Z0-9]/g,"-")}-${uid(5)}.db`),
      forceMigration: true,
    });
    await db.exec(`
      CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT UNIQUE);
      INSERT INTO test (name) VALUES ("foo");
    `);
  });
  this.afterEach(async function(){
    try{
      await db.close(); //Otherwise, it leaks

    }catch(e){
      if(!/Database is closed/.test((e as any).message)){
        throw e;
      }
    }
    await fs.rm(db.config.filename);
  });

  it("migrations are indempotent", async function(){
    let config = db.config;
    await db.close();
    //Will fail if migrations can't be reapplied
    //Also tests syntax of the "down" migration.
    db = await open({
      ...config,
      forceMigration: true
    });
  });

  it("opens and makes a transaction", async function(){
    await expect(db.beginTransaction(async (tr)=>{
      await tr.exec(`INSERT INTO test (name) VALUES ("bar")`);
      return await tr.all(`SELECT * FROM test`);
    })).to.eventually.have.property("length", 2);
    await expect(db.all(`SELECT * FROM test`)).to.eventually.have.property("length", 2);
  });

  it("rollbacks when an error occurs", async function(){
    await expect(db.beginTransaction(async (tr)=>{
      await tr.exec(`INSERT INTO test (name) VALUES ("bar")`);
      await tr.exec(`INSERT INTO test (name) VALUES ("foo")`); //UNIQUE VIOLATION
    })).to.be.rejectedWith("SQLITE_CONSTRAINT: UNIQUE");
    await expect(db.all(`SELECT * FROM test`)).to.eventually.have.property("length", 1);
  });

  it("provides isolation to parent db", async function(){
    let p;
    let length = (await db.all(`SELECT * FROM test`)).length
    await expect(db.beginTransaction(async (tr)=>{
      await tr.exec(`INSERT INTO test (name) VALUES ($val)`,{$val:"bar"});
      p = await db.all(`SELECT * FROM test`)
    })).to.be.fulfilled;
    expect(p).to.have.property("length", length);
  });
  it("provides isolation from parent db", async function(){
    let p;
    await expect(db.beginTransaction(async (tr)=>{
      await tr.get("SELECT * FROM test") // makes the transaction explicit
      p = db.exec(`INSERT INTO test (name) VALUES ("bar")`)
      return await tr.all(`SELECT name FROM test`);
    })).to.eventually.deep.equal([{name: "foo"}]);
    await expect(p).to.be.fulfilled;
  });
});

describe("migrations", function(){
  let db :Database, count=0;
  this.beforeEach(async function(){
    db = await open({
      filename: `file:memDbMigration${++count}?mode=memory&cache=shared`,
      forceMigration: true,
    });
  });
  this.afterEach(async function(){
    await db.close();
  });

  describe("004-node-ids.sql", function(){
    let upStmt :string, downStmt :string;
    this.beforeAll(async function(){
      [upStmt, downStmt] = (await fs.readFile(path.join(thisDir, "../../migrations/004-node-ids.sql"),"utf-8")).split("-- Down");
    });
    it("creates node and tour ids", async function(){
      let vfs = new Vfs("/tmp/not-a-directory", db);
      const scene_id = await vfs.createScene("foo");
      const data = JSON.stringify({
        nodes: [
          {name: "Camera"},
          {name: "Model"},
          {name: "Lights"}
        ],
        setups: [{
          tours: [
            {steps:[], titles:{EN: "Tour 1"}}
          ]
        }]
      });

      const id = await vfs.writeDoc(data, scene_id);

      await expect(db.exec(upStmt)).to.be.fulfilled;

      const m_doc = JSON.parse((await vfs.getDocById(id)).data);
      expect(m_doc).to.have.property("nodes").with.length(3);
      for(let node of m_doc.nodes){
        expect(node).to.have.property("id").a.string;
      }

      expect(m_doc).to.have.property("setups").with.length(1);
      const tours = m_doc.setups[0].tours;
      expect(tours).to.have.length(1);
      expect(tours[0]).to.have.property("id").a.string;
    });

    it("respects existing ids", async function(){
      let vfs = new Vfs("/tmp/not-a-directory", db);
      const scene_id = await vfs.createScene("foo");
      const data = JSON.stringify({
        nodes: [
          {name: "Camera", id:"01abfe"},
          {name: "Model"},
          {name: "Lights"}
        ],
        setups: [{
          tours: [
            {steps:[], titles:{EN: "Tour 1"}}
          ]
        }]
      });

      const id = await vfs.writeDoc(data, scene_id);

      await expect(db.exec(upStmt)).to.be.fulfilled;

      const m_doc = JSON.parse((await vfs.getDocById(id)).data);
      expect(m_doc).to.have.property("nodes").with.length(3);
      expect(m_doc.nodes[0]).to.have.property("id", "01abfe");
    });
  });
});
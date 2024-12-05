import fs from "fs/promises";
import os from "os";
import timers from "timers/promises";
import { expect } from "chai";
import open, { Database } from "./db.js";
import path from "path";
import { fileURLToPath } from 'url';
import uid from "../../utils/uid.js";
import Vfs from "../index.js";
import UserManager from "../../auth/UserManager.js";

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
  describe("migration", function(){
    //Check if the last migration's UP/DOWN steps can be applied without error
    //Doesn't check much else
    it("over empty database", async function(){
      let config = db.config;
      await db.close();
      //Will fail if migrations can't be reapplied
      //Also tests syntax of the "down" migration.
      db = await open({
        ...config,
        forceMigration: true
      });
    });
  
    it("over dummy data", async function(){
      let vfs = new Vfs(os.tmpdir(), db);
      let users = new UserManager(db);
      let user = await users.addUser("bob", "12345678", false);
      await vfs.createScene("foo");
      // await vfs.writeDoc("{}", {scene: "foo", user_id: 0, name: "test.json", mime: "application/json"});
      // await vfs.removeFile({scene: "foo", name: "test.json", user_id: 0});
      // await vfs.writeDoc(`{"foo": "bar"}`, {scene: "foo", user_id: user.uid, name: "test.json", mime: "application/json"});
      let config = db.config;
      await db.close();
      //Will fail if migrations can't be reapplied
      //Also tests syntax of the "down" migration.
      db = await open({
        ...config,
        forceMigration: true
      });
    });
  });

  describe("beginTransaction()", function(){
    it("provides isolation to parent db", async function(){
      let p;
      let length = (await db.all(`SELECT * FROM test`)).length
      await expect(db.beginTransaction(async (tr)=>{
        await tr.run(`INSERT INTO test (name) VALUES ($val)`,{$val: "bar"});
        p = await db.all(`SELECT * FROM test`)
      })).to.be.fulfilled;
      expect(p).to.have.property("length", length);
    });
  
    it("provides isolation from parent db", async function(){
      let p;
      await expect(db.beginTransaction(async (tr)=>{
        await tr.get("SELECT * FROM test") // makes the transaction explicit
        p = db.run(`INSERT INTO test (name) VALUES ("bar")`)
        return await tr.all(`SELECT name FROM test`);
      })).to.eventually.deep.equal([{name: "foo"}]);
      await expect(p).to.be.fulfilled;
    });
  
    it("nested transactions reuse the same database instance", async function(){
      let count = 0;
      await expect(db.beginTransaction(async (tr)=>{
        let _close = tr.close;
        tr.close = async ()=>{
          _close.call(tr);
          count++;
        }
        expect(tr).to.not.equal(db);
        await tr.beginTransaction(async tr2=>{
          expect(tr2).to.equal(tr);
        })
      })).to.be.fulfilled;
      expect(count).to.equal(1);
      
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
  
    it("won't deadlock", async function(){
      await expect(db.beginTransaction(async (tr)=>{
        await tr.all("SELECT * FROM test");
        await tr.run(`INSERT INTO test (name) VALUES ("alice")`);
        await tr.beginTransaction(async tr2=>{
          await tr2.all("SELECT * FROM test");
          await tr2.run(`INSERT INTO test (name) VALUES ("bob")`);
        })
        await tr.all("SELECT * FROM test");
        await tr.run(`INSERT INTO test (name) VALUES ("charlie")`)
      })).to.be.fulfilled;
    });
  
    it("rollback unwraps properly from within", async function(){
      let exp = [
        {id: 1, name: "foo"},
        {id: 2, name: "alice"},
        {id: 3, name: "bob"}
      ]
      await expect(db.beginTransaction(async (tr)=>{
        await tr.run(`INSERT INTO test (name) VALUES ("alice")`);
        await expect(tr.beginTransaction(async tr2=>{
          await tr2.all("SELECT * FROM test");
          throw new Error("Dummy");
        })).to.be.rejectedWith("Dummy");
        await tr.run(`INSERT INTO test (name) VALUES ("bob")`);
        return await tr.all("SELECT * FROM test");
      })).to.eventually.deep.equal(exp);
  
      expect(await db.all("SELECT * FROM test"), `changes should not be rolled back`).to.deep.equal(exp);
  
    })
  
    it("picks up changes made within a transaction", async function(){
      await expect(db.beginTransaction(async (tr)=>{
        await tr.run(`PRAGMA user_version = 42`);
      })).to.be.fulfilled;
      await expect(db.get("PRAGMA user_version"), `user_version change should be picked up from outside the transaction`).to.eventually.have.property("user_version", 42);
    });
  
    it("clears the transaction stack", async function(){
      await expect(db.beginTransaction(async (tr)=>{
        await tr.beginTransaction(async ()=>{});
        //Ending a transaction will cause the outer COMMIT to fail 
        //unless the previous transaction is still on the stack
        await tr.run(`END`);
      })).to.be.rejectedWith("SQLITE_ERROR: no such savepoint");

      await expect(db.beginTransaction(async (tr)=>{
        await expect(tr.beginTransaction(()=>Promise.reject(new Error("dummy")))).to.be.rejectedWith("dummy");
        //Ending a transaction will cause the outer COMMIT to fail 
        //unless the previous transaction is still on the stack
        await tr.run(`END`);
      })).to.be.rejectedWith("SQLITE_ERROR: no such savepoint");
    });
  })
});

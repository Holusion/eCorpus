import fs from "fs/promises";
import os from "os";
import { expect } from "chai";
import path from "path";
import { listMigrations, mapMigrations, migrate, parseMigrationString } from "./migrations.js";
import { Client } from "pg";



describe("Database migration", function(){
  this.beforeAll(async function(){
    this.dir = await fs.mkdtemp(path.join(os.tmpdir(), "eCorpus-db-migration-tests-"));
  });

  this.afterAll(async function(){
    if(this.dir) await fs.rm(this.dir, {recursive: true, force: true});
  });
  //Tests the module code. Check out db.test.ts for eCorpus' actual migration files checks
  describe("listsMigrations()", function(){
    it("lists files in a folder", async function(){
      let dir = await fs.mkdtemp(path.join(this.dir, "migrations-"));
      await fs.writeFile(path.join(dir, "002-bar.sql"), "\n");
      await fs.writeFile(path.join(dir, "001-foo.sql"), "\n");

      expect(await listMigrations(dir)).to.deep.equal([
        {id: 1, name: "foo", filepath: path.join(dir, "001-foo.sql")},
        {id: 2, name: "bar", filepath: path.join(dir, "002-bar.sql")},
      ]);
    });

    it("throws if there is no migrations in directory", async function(){
      await expect(listMigrations(this.dir)).to.be.rejectedWith(`No migration files found in ${this.dir}`);
    });

    it("throws if directory does not exist", async function(){
      let dir = path.join(this.dir, "foo")
      await expect(listMigrations(dir)).to.be.rejectedWith(`ENOENT`);
    });
  });

  describe("mapMigrations()", function(){
    it("skips non-matching files", function(){
      expect(mapMigrations([
        "/path/to/001-initial.sql",
        "/path/to/readme.md"
      ])).to.deep.equal([{id: 1, name: "initial", filepath: "/path/to/001-initial.sql"}]);
    });
    it("sorts files", function(){
      expect(mapMigrations([
        "/path/to/002-second.sql",
        "/path/to/001-initial.sql",
      ])).to.deep.equal([
        {id: 1, name: "initial", filepath: "/path/to/001-initial.sql"},
        {id: 2, name: "second", filepath: "/path/to/002-second.sql"},
      ]);
    });
  })

  describe("parseMigrationString()", function(){

    it("parse simplest migration", function(){
      expect(parseMigrationString("CREATE TABLE foo;\n")).to.deep.equal({
        up: 'CREATE TABLE foo;',
        down: '',
      });
    });

    it("parse up/down components", function(){
      expect(parseMigrationString("CREATE TABLE foo;\n-- down\nDROP TABLE foo;")).to.deep.equal({
        up: 'CREATE TABLE foo;',
        down: 'DROP TABLE foo;',
      });
    });

    it("parse any valid comment for --down", function(){
      [
        "-- down",
        "--\tdown",
        "--  down",
        "--- down",
        "--down",
        "-- DOWN"
      ].forEach((s)=>{
        expect(parseMigrationString(`A\n${s}\nB`),`${s} should be a valid migration delimiter`).to.deep.equal({up: "A", down: "B"});
      });

      [
        "CREATE TABLE FOO --down",
      ].forEach((s)=>{
        let str = `A\n${s}\nB`
        expect(parseMigrationString(str),`${s} should not be a valid migration delimiter`).to.deep.equal({up:str, down: ''});
      });
    });

    it("throws if down delimiter is matched multiple times", function(){
      expect(()=>parseMigrationString(`A\n--down\nB\n--down\nc`)).to.throw("multiple")
    });
  });


  describe("migrate()", function(){
    let db :Client;
    let uri: string, dir :string;
    this.beforeEach(async function(){
      dir = await fs.mkdtemp(path.join(this.dir, "migrate-"));
      uri = await getUniqueDb();
      db = new Client({connectionString: uri});
      await db.connect();
    });
    this.afterEach(async function(){
      await db.end();
    });

    it("applies migrations", async function(){
      await fs.writeFile(path.join(dir, "001-initial.sql"), "CREATE TABLE foo(name TEXT);\n");
      await fs.writeFile(path.join(dir, "002-populate.sql"), "INSERT INTO foo(name) VALUES ('test');\n");
      await migrate({db, migrations:dir, force: false});
      expect((await db.query("SELECT * FROM foo")).rows).to.deep.equal([{name: "test"}]);
    });

    it("stores down component", async function(){
      await fs.writeFile(path.join(dir, "001-initial.sql"), "CREATE TABLE foo(name TEXT);\n-- down\n DROP TABLE foo;");
      await migrate({db, migrations:dir, force: false});
      expect((await db.query("SELECT id, down FROM migrations")).rows).to.deep.equal([{id: 1, down: "DROP TABLE foo;"}]);
    });

    it("applies nothing if it encounters an error", async function(){
      await fs.writeFile(path.join(dir, "001-initial.sql"), "CREATE TABLE foo(name TEXT);\nxxx\n-- down\n DROP TABLE foo;");
      await expect(migrate({db, migrations:dir, force: false})).to.be.rejectedWith("Syntax error at line 2");
      expect((await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public';")).rows).to.deep.equal([{table_name: "migrations"}]);
      expect((await db.query("SELECT * FROM migrations")).rows).to.deep.equal([]);
    });

    it("reapplies last migration if force == true", async function(){
      await fs.writeFile(path.join(dir, "001-initial.sql"), "CREATE TABLE foo(name TEXT);\n-- down\n DROP TABLE foo;");
      await fs.writeFile(path.join(dir, "002-populate.sql"), "INSERT INTO foo(name) VALUES ('test');\n-- down\nDELETE FROM foo;\n");
      await migrate({db, migrations:dir, force: false});

      expect((await db.query(`SELECT * FROM foo`)).rows).to.deep.equal([{name: "test"}]);

      await fs.writeFile(path.join(dir, "002-populate.sql"), "INSERT INTO foo(name) VALUES ('test2');\n-- down\nDELETE FROM foo;\n");
      await migrate({db, migrations:dir, force: true});

      expect((await db.query(`SELECT * FROM foo`)).rows).to.deep.equal([{name: "test2"}]);

      await fs.writeFile(path.join(dir, "002-populate.sql"), "INSERT INTO foo(name) VALUES ('test3');\n-- down\nDELETE FROM foo;\n");
      await migrate({db, migrations:dir, force: false});
      //Won't reapply the migration with force = false;

      expect((await db.query(`SELECT * FROM foo`)).rows).to.deep.equal([{name: "test2"}]);

    });

    it("undo migrations that are no longer present", async function(){
      //This is possibly moderately safe in practice?
      //However it should make going back and forth in dev branches easier
      await fs.writeFile(path.join(dir, "001-initial.sql"), "CREATE TABLE foo(name TEXT);\n-- down\n DROP TABLE foo;");
      await fs.writeFile(path.join(dir, "002-populate.sql"), "INSERT INTO foo(name) VALUES ('test');\n-- down\nDELETE FROM foo;\n");
      await migrate({db, migrations:dir, force: false});

      expect((await db.query(`SELECT * FROM foo`)).rows).to.deep.equal([{name: "test"}]);
      await fs.rm(path.join(dir, "002-populate.sql"));

      await migrate({db, migrations:dir, force: false});

      expect((await db.query(`SELECT * FROM foo`)).rows).to.deep.equal([]);
    });

    it("reports errors when \"down\" fails", async function(){
      await fs.writeFile(path.join(dir, "001-initial.sql"), "CREATE TABLE foo(name TEXT);\n-- down\n DROP TABLE foo;\nxxx\n");
      //Apply once
      await migrate({db, migrations:dir, force: false});
      //force-apply to run "down"
      await expect(migrate({db, migrations:dir, force: true})).to.be.rejectedWith("x");

    })

  });
})
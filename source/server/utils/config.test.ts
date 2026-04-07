import {expect} from "chai";
import staticConfig, {Config, parse} from "./config.js";
import path from "node:path";
import { hostname } from "node:os";

describe("staticConfig", function(){
  it("get a config option", function(){
    expect(staticConfig.public).to.equal(true);
  });

  it("is frozen", function(){
    expect(()=>{
      //@ts-ignore
      staticConfig.public = false
    }).to.throw();
  });

  describe("parse()", function(){
    it("parse integers", function(){
      expect(parse({PORT:"3000"})).to.have.property("port", 3000);
    })

    it("parse ports or unix socket paths", function(){
      expect(parse({PORT:"3000"})).to.have.property("port", 3000);
      expect(parse({PORT:"/var/run/socket.sock"})).to.have.property("port", "/var/run/socket.sock");
    });
    
    it("parse booleans", function(){
      expect(parse({PUBLIC:"false"})).to.have.property("public", false);
      expect(parse({PUBLIC:"0"})).to.have.property("public", false);
      expect(parse({PUBLIC:"true"})).to.have.property("public", true);
      expect(parse({PUBLIC:"1"})).to.have.property("public", true);
    });

    it("set up defaults with functions", function(){
      let opts = parse({ROOT_DIR:"/app"})
      expect(opts).to.have.property("root_dir", "/app");
      expect(opts).to.have.property("files_dir", "/app/files");
    });
    
    it("override default functions if necessary", function(){
      let opts = parse({ROOT_DIR:"/app", FILES_DIR: "/tmp/files"})
      expect(opts).to.have.property("root_dir", "/app");
      expect(opts).to.have.property("files_dir", "/tmp/files");
    });

    it("constructs postgres connection string from default environment variables", function(){
      let opts = parse({
        PGHOST: "example.com",
        PGPORT: "9876",
        PGUSER: "foo",
        PGPASSWORD: "secret",
        PGDATABASE: "my_database"
      });
      expect(opts).to.have.property("database_uri", "postgres://foo:secret@example.com:9876/my_database")
    });

    it("uses unix socket if no password is provided", function(){
      //the reasoning is that no sane person would run passwordless postgres on localhost ?
       let opts = parse({
        PGDATABASE: "my_database"
      });
      expect(opts).to.have.property("database_uri", "socket:///var/run/postgresql/?db=my_database")
    });
  });

  describe("parsePGEnv comprehensive behavior matrix", function() {
    let originalUser: string | undefined;

    beforeEach(() => {
      originalUser = process.env.USER;
      process.env.USER = "testuser";
    });

    afterEach(() => {
      if (originalUser !== undefined) {
        process.env.USER = originalUser;
      }
    });

    // ==========================
    // SOCKET CONNECTION CASES
    // ==========================

    describe("Socket connection (Unix domain socket)", function() {
      it("Case 1: No PGHOST, no PGPASSWORD with PGDATABASE → socket with db param", function() {
        const opts = parse({
          PGDATABASE: "mydb",
        });
        expect(opts.database_uri).to.equal("socket:///var/run/postgresql/?db=mydb");
      });

      it("Case 2: Empty env → socket without db param", function() {
        const opts = parse({});
        expect(opts.database_uri).to.equal("socket:///var/run/postgresql/");
      });

      it("Case 3: Only PGUSER, no PGHOST, no PGPASSWORD → socket (PGUSER ignored)", function() {
        const opts = parse({
          PGUSER: "appuser",
        });
        // Socket connection because no PGHOST and no PGPASSWORD
        expect(opts.database_uri).to.equal("socket:///var/run/postgresql/");
      });

      it("Case 4: PGHOST absent but PGDATABASE present, no PGPASSWORD → socket", function() {
        const opts = parse({
          PGDATABASE: "proddb",
          PGPORT: "5433",
          PGUSER: "admin",
        });
        // Socket because no PGHOST and no PGPASSWORD
        expect(opts.database_uri).to.equal("socket:///var/run/postgresql/?db=proddb");
      });
    });

    // ==========================
    // TCP CONNECTION CASES
    // ==========================

    describe("TCP connection (with PGHOST or PGPASSWORD present)", function() {
      it("Case 5: Only PGHOST → TCP with custom host, default port, default user", function() {
        const opts = parse({
          PGHOST: "db.example.com",
        });
        expect(opts.database_uri).to.equal("postgres://db.example.com:5432/testuser");
      });

      it("Case 6: PGHOST + PGPORT → TCP with custom host and port", function() {
        const opts = parse({
          PGHOST: "db.example.com",
          PGPORT: "3306",
        });
        expect(opts.database_uri).to.equal("postgres://db.example.com:3306/testuser");
      });

      it("Case 7: PGHOST + PGUSER → TCP with custom host and user", function() {
        const opts = parse({
          PGHOST: "db.example.com",
          PGUSER: "dbuser",
        });
        expect(opts.database_uri).to.equal("postgres://dbuser@db.example.com:5432/testuser");
      });

      it("Case 8: PGHOST + PGPASSWORD → TCP with host and password", function() {
        const opts = parse({
          PGHOST: "db.example.com",
          PGPASSWORD: "secret123",
        });
        expect(opts.database_uri).to.equal("postgres://:secret123@db.example.com:5432/testuser");
      });

      it("Case 9: Only PGPASSWORD (no PGHOST) → TCP with localhost and password", function() {
        const opts = parse({
          PGPASSWORD: "secret123",
        });
        // Important: PGPASSWORD present means we don't enter socket branch!
        // So defaults to localhost:5432 but with password
        expect(opts.database_uri).to.equal("postgres://:secret123@localhost:5432/testuser");
      });

      it("Case 10: Only PGPORT (no PGHOST) → socket (PGPORT ignored)", function() {
        const opts = parse({
          PGPORT: "5433",
        });
        // No PGHOST and no PGPASSWORD = socket condition is true
        // PGPORT should not matter
        expect(opts.database_uri).to.equal("socket:///var/run/postgresql/");
      });

      it("Case 11: Only PGUSER (no PGHOST, no PGPASSWORD) → socket, PGUSER ignored", function() {
        const opts = parse({
          PGUSER: "appuser",
        });
        expect(opts.database_uri).to.equal("socket:///var/run/postgresql/");
      });

      it("Case 12: Full config - all variables present", function() {
        const opts = parse({
          PGHOST: "db.example.com",
          PGPORT: "5433",
          PGUSER: "dbuser",
          PGPASSWORD: "secret123",
          PGDATABASE: "production_db",
        });
        expect(opts.database_uri).to.equal(
          "postgres://dbuser:secret123@db.example.com:5433/production_db"
        );
      });

      it("Case 13: PGHOST + PGDATABASE (PGDATABASE affects pathname)", function() {
        const opts = parse({
          PGHOST: "db.example.com",
          PGDATABASE: "myapp_db",
        });
        expect(opts.database_uri).to.equal("postgres://db.example.com:5432/myapp_db");
      });
    });

    // ==========================
    // KNOWN ISSUES & EDGE CASES
    // ==========================

    describe("Known issues and edge cases", function() {
      it("ISSUE 1: process.env.USER is always used, not the passed env parameter", function() {
        const env1 = { PGHOST: "host1.com" };

        process.env.USER = "user1";
        const result1 = parse(env1);

        process.env.USER = "user2";
        const result2 = parse(env1);

        // Different results for same env object because process.env.USER changed
        expect(result1.database_uri).to.include("user1");
        expect(result2.database_uri).to.include("user2");
        expect(result1.database_uri).to.not.equal(result2.database_uri);
      });

      it("ISSUE 2: Port is set as string, URL handles conversion properly", function() {
        const opts = parse({
          PGHOST: "db.example.com",
          PGPORT: "5433",
        });
        expect(opts.database_uri).to.include(":5433");
      });

      it("Edge case: Empty string values in environment", function() {
        const opts = parse({
          PGHOST: "",
          PGPASSWORD: "",
          PGDATABASE: "",
        });
        // Empty strings are falsy in the if condition check
        // So this should produce a socket result
        expect(opts.database_uri).to.be.a("string");
      });

      it("Edge case: PGPORT with non-numeric value", function() {
        const opts = parse({
          PGHOST: "db.example.com",
          PGPORT: "not-a-number",
        });
        expect(opts.database_uri).to.be.a("string");
      });

      it("Edge case: Special characters in password (URL-encoded by URL constructor)", function() {
        const opts = parse({
          PGHOST: "db.example.com",
          PGPASSWORD: "p@ssw0rd:with/special?chars",
        });
        // Special chars ARE URL-encoded by the URL constructor
        // @ → %40, : → %3A, / → %2F, ? → %3F
        expect(opts.database_uri).to.include("p%40ssw0rd%3Awith%2Fspecial%3Fchars");
      });

      it("DESIGN: Socket vs TCP decision based on PGHOST AND PGPASSWORD", function() {
        // Socket mode: if neither PGHOST nor PGPASSWORD
        const socketOpts = parse({});
        expect(socketOpts.database_uri).to.include("socket:///");

        // TCP mode: if PGPASSWORD alone (without PGHOST)
        const tcpWithPassword = parse({ PGPASSWORD: "secret" });
        expect(tcpWithPassword.database_uri).to.include("localhost");
        expect(tcpWithPassword.database_uri).to.include("secret");
      });
    });
  });
});

describe("runtimeConfig", function(){
  const ok = ()=>Promise.resolve([]);
  const nok = ()=>Promise.reject(new Error("Some Error"));
  it("can use defaults", async function(){
    const c = new Config({all: ok, run: ok} as any, {});
    expect(c.get("node_env")).to.equal("development");
    expect(c.get("port")).to.equal(8000);
    expect(c.get("templates_dir")).to.equal(path.join(process.cwd(), "templates"));
  });

  it("can override values", async function(){
    //We don't perform the actual DB write, which shouldn't matter
    const c = new Config({all: ok, run: ok} as any, {});
    const changed = await c.set("brand", "Hello World");
    expect(changed).to.be.true;
    expect(c.get("brand")).to.equal("Hello World");
  });

  it("env-defined values are protected", async function(){
    const c = new Config({all: ok, run: ok} as any, {
      BRAND: "Static Brand",
    });
    const changed = await c.set("brand", "Hello World");
    expect(changed).to.be.false;
    expect(c.get("brand")).to.equal("Static Brand");
  });

  it("static values are protected", async function(){
    //We don't perform the actual DB write, which shouldn't matter
    const c = new Config({all: nok, run: nok} as any, {});
    await expect(c.set("port" as any, "9000")).to.be.rejectedWith(`Invalid runtime configuration key : port`);
    expect(c.get("port")).to.equal(8000);
  });

  it("performs validation on submitted values", async function(){
    const c = new Config({all:()=>Promise.resolve([]), run: ()=>Promise.resolve()} as any, {});
    await c.set("experimental", true);
    expect(c.get("experimental")).to.equal(true);
  });

  it("rejects values that can't be serialized", async function(){
    const c = new Config({all: nok, run: nok} as any, {});
    await expect(c.set("experimental", "X" as any)).to.be.rejectedWith(`Serialization of X is not indempotent for configuration key experimental`);
  });

  it("is iterable", function(){
    const c = new Config({all: nok, run: nok} as any, {});
    expect(Array.from(c)).to.have.property("length").a("number").above(1);
    for(let entry of c){
      expect(Array.isArray(entry), `Expected entry to be an array but received : ${entry}`).to.be.ok;
      expect(entry).to.have.length(2);
      expect(entry[0]).to.be.a("string");
      expect(entry[1]).to.have.property("locked");
      expect(entry[1]).to.have.property("value");
    }
  });


});

describe("Config static methods", function(){
  afterEach(function(){
    Config.close();
  });

  it("open() throws if called twice without close()", async function(){
    const ok = ()=>Promise.resolve([]);
    await Config.open({all: ok, run: ok} as any, {});
    await expect(Config.open({all: ok, run: ok} as any, {})).to.be.rejectedWith("Config is a system singleton. One instance already exists");
  });

  it("throws before open()", function(){
    //Only works for runtime config
    expect(()=> Config.get("brand")).to.throw("Config singleton hasn't been initialized");
  });

  it("returns a value after open()", async function(){
    const ok = ()=>Promise.resolve([]);
    const c = await Config.open({all: ok, run: ok} as any);
    await c.set("brand", "test");
    expect(Config.get("brand")).to.equal("test");
  });

  it("throws again after close()", async function(){
    const ok = ()=>Promise.resolve([]);
    await Config.open({all: ok, run: ok} as any, {});
    Config.close();
    expect(()=> Config.get("brand")).to.throw("Config singleton hasn't been initialized");
  });

  it("can get static values before initialization", function(){
    expect(Config.get("hostname")).to.equal(hostname());
  });

});

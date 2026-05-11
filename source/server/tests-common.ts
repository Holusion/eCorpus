import fs from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import { Pool, Client, escapeIdentifier } from 'pg';
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";

//@ts-ignore
import sourceMaps from "source-map-support";
import { AppLocals } from "./utils/locals.js";
import { randomBytes } from "node:crypto";
import { debuglog } from "node:util";
import Vfs from "./vfs/index.js";
sourceMaps.install();

chai.use(chaiAsPromised);

process.env["TEST"] ??= "true";
// Force every test run to use the in-memory nodemailer json transport so no
// SMTP connection is ever attempted from a test.
process.env["MAIL_FAKE"] ??= "true";

const debug = debuglog("pg:debug");

declare global{
  var dataStream:(src ?:Array<Buffer|string>)=>AsyncGenerator<Buffer, void, unknown>;
  var expect :typeof chai.expect;
  /**
   * Create a full-fledged service stack. using a unique-named clean database.
   * It takes some time so create / drop a database so this should ideally be called once per test file, using {@link resetIntegrationContext} between individual tests
   * Cleanup will be auto-registered to an after(each) hook, though it can sometimes fail to execute if tests are interrupted
   */
  var createIntegrationContext :(c:Mocha.Context, config_override ?:Record<string, string>)=>Promise<AppLocals>;
  /**
   * Resets a test context's data.
   * Be careful with tests that modify internal service state like config or session keys:
   * these will not be reset automatically
   */
  var resetIntegrationContext :(c:Mocha.Context)=>Promise<void>;
  /**
   * Create a database using the given `name` prefix, appending a random string for uniqueness.
   */
  var getUniqueDb: (name?: string)=>Promise<string>;
  /**
   * Drop a created tmp database
   */
  var dropDb: (uri: string)=>Promise<void>;
}

global.expect = chai.expect;

global.dataStream = async function* (src :Array<Buffer|string> =["foo", "\n"]){
  for(let d of src){
    let b = Buffer.isBuffer(d)?d: Buffer.from(d);
    yield await Promise.resolve(b);
  }
}
const db_port = parseInt(process.env["PGPORT"]??"3211");
if(Number.isNaN(db_port)){
  throw new Error("Invalid database port : "+(process.env["PGPORT"]??"5432"));
}
const db_uri = new URL(`postgresql://${process.env["PGHOST"]??"localhost"}:${db_port}`);
db_uri.username = process.env["PGUSER"] ?? process.env["USER"] ??"";
db_uri.password = process.env["PGPASSWORD"]?? "";

let _systemPool: Pool | null = null;
function getSystemPool(): Pool {
  if (!_systemPool) {
    _systemPool = new Pool({
      connectionString: new URL('/postgres', db_uri).toString(),
      allowExitOnIdle: true, //So we don't require a pool.end() for tests to exit
    });
  }
  return _systemPool;
}

global.getUniqueDb = async function(name?: string){
  const dbname = name? name.replace(/[^\w]/g, "_").substring(0,58)+"_"+randomBytes(2).toString("hex"): `eCorpus_test_${randomBytes(4).toString("hex")}`;
  await getSystemPool().query(`CREATE DATABASE ${escapeIdentifier(dbname)}`);
  let uri = new URL(`/${encodeURIComponent(dbname)}`, db_uri).toString();
  debug(`Created test database at ${uri}`);
  return uri;
};


global.dropDb = async function(uri: string){
  //Ideally we'd use force here, but we'd need this issue to be fixed : https://github.com/brianc/node-postgres/issues/3287
  // pool.end() doesn't wait for the connections to be closed before resolving.
  // so instead we just timeout the call to DROP DATABASE
  const timeout = new Promise<void>((_resolve, reject) =>
    setTimeout(() => reject(new Error(`dropDb timed out after 200ms for ${uri}`)), 200)
  );
  await Promise.race([
    getSystemPool().query(`DROP DATABASE ${escapeIdentifier(new URL(uri).pathname.slice(1))}`),
    timeout,
  ]).catch((e) => console.warn(e.message));
  debug(`Dropped test database at ${uri}`);
}

global.createIntegrationContext = async function(c :Mocha.Context, config_override :Record<string, string>={}){
  let {default:createService} = await import("./create.js");
  let titleSlug = "t_"+ (c.currentTest?.title || c.test?.parent?.fullTitle() || `eCorpus_integration`).replace(/[^\w]/g, "_").substring(0, 58) +"_"+randomBytes(4).toString("hex");
  c.db_uri = await getUniqueDb(titleSlug);
  c.dir = await fs.mkdtemp(path.join(tmpdir(), titleSlug));
  c.config_env = Object.assign(
    { //Common options
      ROOT_DIR: c.dir,
      DATABASE_URI: c.db_uri,
      CLEAN_DATABASE: "false",
      VERBOSE: "false",
    },
    //Options we might want to customize
    config_override
  );
  c.services = await createService( c.config_env );
  c.server = c.services.app;
  const suite = c.test?.parent as any;
  if(suite?._beforeEach?.includes(c.test)){
    suite.afterEach(async function(this: Mocha.Context){ await cleanIntegrationContext(this); });
  } else {
    suite?.afterAll(async function(this: Mocha.Context){ await cleanIntegrationContext(this); });
  }
  return c.server.locals;
}


async function cleanIntegrationContext (c :Mocha.Context){
  if(!c.services) return debug(`No integration context (double close?): ${c.currentTest?.title?? "anonymous"}`);
  await c.services?.close();
  await dropDb(c.db_uri);
  if(c.dir) await fs.rm(c.dir, {recursive: true});
  delete c.services;
}

global.resetIntegrationContext = async function(c :Mocha.Context){
  // Exclude infrastructure tables that should not be wiped between tests
  const rows: {tablename:string}[] = await c.services.db.all(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('migrations', 'keys')`
  );
  if(rows.length > 0){
    const tableList = rows.map(r => escapeIdentifier(r.tablename)).join(", ");
    await c.services.db.run(`TRUNCATE ${tableList} RESTART IDENTITY CASCADE`);
  }
  const baseDir = (c.services.vfs as Vfs).baseDir;
  for(const subdir of ["uploads", "objects", "artifacts"]){
    const dir = path.join(baseDir, subdir);
    const entries = await fs.readdir(dir);
    await Promise.all(entries.map(e => fs.rm(path.join(dir, e), {recursive: true})));
  }
}
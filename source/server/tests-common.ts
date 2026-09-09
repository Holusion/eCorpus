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
//Imported for its side effect as much as for `createService`: ts-node compiles
//the whole server here, while mocha is still loading files. Left to the first
//hook that needs it (this used to be an `await import()` inside
//createIntegrationContext) it costs seconds, overruns mocha's 2s hook timeout,
//and `--grep` decides which hook pays - which is why filtered runs were the
//ones that failed. An actual createService() is ~75ms.
import createService from "./create.js";
sourceMaps.install();

chai.use(chaiAsPromised);

//Set by the `test` npm scripts, not from here: these are read by modules that
//static imports have already evaluated by the time this body runs
for(const name of ["TEST", "MAIL_FAKE"]){
  if(!process.env[name]) throw new Error(`${name} is not set. Run the suite through \`npm test\`, or pass TEST=1 MAIL_FAKE=1 if calling mocha yourself.`);
}

const debug = debuglog("pg:debug");

declare global{
  var dataStream:(src ?:Array<Buffer|string>)=>AsyncGenerator<Buffer, void, unknown>;
  var expect :typeof chai.expect;
  /**
   * Mint a Bearer `Authorization` header value for a user of the current
   * integration context (the replacement for Basic auth in tests).
   * A fresh token is created on each call: full-rights (`all`) by default, or
   * carrying the given scope set for exercising scoped-credential behavior.
   * Unknown/deleted users get a syntactically valid token that will fail
   * verification, mirroring how bad Basic credentials used to behave.
   */
  var bearer: (user: string | number | {uid: number}, scope?: string[]) => Promise<string>;
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

let currentLocals: AppLocals | null = null;

global.bearer = async function(userRef, scope){
  if(!currentLocals) throw new Error("bearer() requires an active integration context");
  const userManager = currentLocals.userManager;
  let user;
  try{
    user = typeof userRef === "object" ? await userManager.getUserById(userRef.uid)
      : typeof userRef === "number" ? await userManager.getUserById(userRef)
      : await userManager.getUserByName(userRef);
  }catch(e){
    //Unknown user: a well-formed token that fails verification (→ 401)
    return `Bearer ec_${Buffer.alloc(32).toString("base64url")}`;
  }
  const {token} = await userManager.createToken(user.uid, scope ? {name: "test-bearer", scope} : {name: "test-bearer"});
  return `Bearer ${token}`;
};

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
  registerContextCleanup(c);
  const pending = c.pending_services = openIntegrationContext(c, config_override);

  const services = await pending;
  if(c.pending_services !== pending){
    //Cleanup adopted us while we were starting, and has closed `services`
    //along with everything else. Mocha ignores a runnable that settles after
    //its timeout, so this throw only keeps us from handing out a dead service.
    throw new Error("Integration context was torn down before it finished starting");
  }
  c.services = services;
  c.server = services.app;
  currentLocals = c.server.locals;
  return c.server.locals;
}

/**
 * The actual creation, kept apart so {@link createIntegrationContext} can
 * publish its promise before doing anything that can be interrupted.
 * Everything it allocates is written to the context as it goes, so cleanup
 * finds it whether or not this ran to completion.
 */
async function openIntegrationContext(c :Mocha.Context, config_override :Record<string, string>){
  let titleSlug = "t_"+ (c.currentTest?.title || c.test?.parent?.fullTitle() || `eCorpus_integration`).replace(/[^\w]/g, "_").substring(0, 58) +"_"+randomBytes(4).toString("hex");
  c.db_uri = await getUniqueDb(titleSlug);
  c.dir = await fs.mkdtemp(path.join(tmpdir(), titleSlug));
  c.config_env = Object.assign(
    { //Common options
      ROOT_DIR: c.dir,
      DATABASE_URI: c.db_uri,
      CLEAN_DATABASE: "false",
    },
    //Options we might want to customize
    config_override
  );
  return await createService( c.config_env );
}

/**
 * Attach the teardown hook for a suite's integration context, once per suite:
 * `afterEach` when the context is built per-test, `afterAll` otherwise.
 */
function registerContextCleanup(c :Mocha.Context){
  const suite = c.test?.parent as any;
  if(!suite || suite._integration_cleanup) return;
  suite._integration_cleanup = true;
  //Not `cleanIntegrationContext` itself: mocha reads a hook's arity and would
  //hand a one-argument function a `done` callback.
  const cleanup = async function(this: Mocha.Context){
    await cleanIntegrationContext(this);
  };
  if(suite._beforeEach?.includes(c.test)) suite.afterEach(cleanup);
  else suite.afterAll(cleanup);
}


async function cleanIntegrationContext (c :Mocha.Context){
  const pending = c.pending_services;
  if(pending){
    //Adopt a creation that is still running. It can't be cancelled halfway -
    //it is taking a database connection and the Config singleton - so wait for
    //it to finish, then close it like any other context.
    delete c.pending_services;
    c.services = await pending.catch((e :any)=>{
      debug(`Integration context failed to start: ${e.message}`);
      return undefined;
    });
  }else if(!c.services){
    return debug(`No integration context (double close?): ${c.currentTest?.title?? "anonymous"}`);
  }
  await c.services?.close();
  delete c.services;
  if(c.db_uri){
    await dropDb(c.db_uri);
    delete c.db_uri;
  }
  if(c.dir){
    await fs.rm(c.dir, {recursive: true});
    delete c.dir;
  }
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
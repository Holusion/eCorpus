import fs from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import { Client, escapeIdentifier } from 'pg';
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";

//@ts-ignore
import sourceMaps from "source-map-support";
import { AppLocals } from "./utils/locals.js";
import { StaticConfigShape, parse } from "./utils/config.js";
import type { Services } from "./create.js";
import { randomBytes } from "node:crypto";
import { debuglog } from "node:util";
sourceMaps.install();

chai.use(chaiAsPromised);

process.env["TEST"] ??= "true";

declare global{
  var dataStream:(src ?:Array<Buffer|string>)=>AsyncGenerator<Buffer, void, unknown>;
  var expect :typeof chai.expect;
  var createIntegrationContext :(c:Mocha.Context, config_override ?:Record<string, string>)=>Promise<AppLocals>;
  var cleanIntegrationContext :(c:Mocha.Context)=>Promise<void>;
  var resetIntegrationContext :(c:Mocha.Context)=>Promise<void>;
  var getUniqueDb: (name?: string)=>Promise<string>;
  var dropDb: (uri: string)=>Promise<void>;
  var withIntegrationContext: (config_override?: Record<string, string>) => Services;
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


global.getUniqueDb = async function(name?: string){
  console.time("globals getUniqueDb");
  const dbname = name? name.replace(/[^\w]/g, "_").substring(0,58)+"_"+randomBytes(2).toString("hex"): `eCorpus_test_${randomBytes(4).toString("hex")}`;
  
  console.time("globals connect");
  const client = new Client({connectionString: new URL(`/postgres`, db_uri).toString()});
  await client.connect();
  console.timeEnd("globals connect");
  try{
    await client.query(`CREATE DATABASE ${escapeIdentifier(dbname)}`);
  }finally{
    await client.end();
  }
  let uri = new URL(`/${encodeURIComponent(dbname)}`, db_uri).toString();
  debuglog("pg:debug")(`Created test database at ${uri}`);
  console.timeEnd("globals getUniqueDb");
  return uri;
};

global.dropDb = async function(uri: string){
  console.time("globals dropDb");
  console.time("globals connect");
  const client = new Client({connectionString: new URL(`/postgres`, db_uri).toString()});
  await client.connect();
  console.timeEnd("globals connect");
  try{
    await client.query(`DROP DATABASE ${escapeIdentifier(new URL(uri).pathname.slice(1))} WITH (FORCE)`);
  }finally{
    await client.end();
  }
  console.timeEnd("globals dropDb");
  debuglog("pg:debug")(`Dropped test database at ${uri}`);
}

global.createIntegrationContext = async function(c :Mocha.Context, config_override :Record<string, string>={}){
  let {default:createService} = await import("./create.js");
  let titleSlug = "t_"+ (c.currentTest?.title ?? c.test?.parent?.title ?? `eCorpus_integration`).replace(/[^\w]/g, "_").substring(0, 58) +"_"+randomBytes(4).toString("hex");
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


global.cleanIntegrationContext = async function(c :Mocha.Context){
  if(!c.services) return debuglog("pg:debug")(`No integration context (double close?): ${c.currentTest?.title?? "anonymous"}`);
  await c.services?.close();
  await dropDb(c.db_uri);
  if(c.dir) await fs.rm(c.dir, {recursive: true});
  delete c.services;
}

global.resetIntegrationContext = async function(c :Mocha.Context){
  
  console.time("globals connect");
  const client = new Client({connectionString: c.db_uri});
  await client.connect();
  console.timeEnd("globals connect");
  console.time("globals truncate");
  try{
    // Exclude infrastructure tables that should not be wiped between tests
    const {rows} = await client.query<{tablename:string}>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('migrations', 'keys')`
    );
    if(rows.length > 0){
      const tableList = rows.map(r => escapeIdentifier(r.tablename)).join(", ");
      await client.query(`TRUNCATE ${tableList} RESTART IDENTITY CASCADE`);
    }
  }finally{
    await client.end();
  }
  const filesDir = path.join(c.dir, "files");
  for(const subdir of ["uploads", "objects", "artifacts"]){
    const dir = path.join(filesDir, subdir);
    try{
      const entries = await fs.readdir(dir);
      await Promise.all(entries.map(e => fs.rm(path.join(dir, e), {recursive: true})));
    }catch{ /* directory may not exist yet */ }
  }
    console.timeEnd("globals truncate");
}
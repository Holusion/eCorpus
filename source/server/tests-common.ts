import fs from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import { Client, escapeIdentifier } from 'pg';
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";

//@ts-ignore
import sourceMaps from "source-map-support";
import { AppLocals } from "./utils/locals.js";
import { Config, parse } from "./utils/config.js";
import { randomBytes } from "node:crypto";
import { debuglog } from "node:util";
sourceMaps.install();

chai.use(chaiAsPromised);

process.env["TEST"] ??= "true";

declare global{
  var dataStream:(src ?:Array<Buffer|string>)=>AsyncGenerator<Buffer, void, unknown>;
  var expect :typeof chai.expect;
  var createIntegrationContext :(c:Mocha.Context, config_override ?:Partial<Config>)=>Promise<AppLocals>;
  var cleanIntegrationContext :(c:Mocha.Context)=>Promise<void>;
  var getUniqueDb: (name?: string)=>Promise<string>;
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


global.getUniqueDb = async function(name?: string){
  const dbname = name? name.replace(/[^\w]/g, "_"): `eCorpus_test_${randomBytes(4).toString("hex")}`;
  const client = new Client({connectionString: new URL(`/postgres`, db_uri).toString()});
  await client.connect();
  try{
    await client.query(`CREATE DATABASE ${escapeIdentifier(dbname)}`);
  }finally{
    await client.end();
  }
  let uri = new URL(`/${encodeURIComponent(dbname)}`, db_uri).toString();
  debuglog("pg:debug")(`Created test database at ${uri}`);
  return uri;
};

global.dropDb = async function(uri: string){
  const client = new Client({connectionString: new URL(`/postgres`, db_uri).toString()});
  await client.connect();
  try{
    await client.query(`DROP DATABASE ${escapeIdentifier(new URL(uri).pathname.slice(1))}`);
  }finally{
    await client.end();
  }
  debuglog("pg:debug")(`Dropped test database at ${uri}`);
}

global.createIntegrationContext = async function(c :Mocha.Context, config_override :Partial<Config>={}){
  let {default:createServer} = await import("./routes/index.js");
  let titleSlug = "t_"+ (c.currentTest?.title.replace(/[^\w]/g, "_") ?? `eCorpus_integration`)+"_"+randomBytes(4).toString("hex");
  c.db_uri = await getUniqueDb(titleSlug);
  c.dir = await fs.mkdtemp(path.join(tmpdir(), titleSlug));
  c.config = Object.assign(
    parse({ //Common options
      ROOT_DIR: c.dir,
      DATABASE_URI: c.db_uri,
      CLEAN_DATABASE: "false",
      VERBOSE: "false",
    }),
    //Options we might want to customize
    config_override
  );
  c.server = await createServer( c.config );
  return c.server.locals;
}

global.cleanIntegrationContext = async function(c :Mocha.Context){
  await c.server.locals.vfs.close();
  await dropDb(c.db_uri);
  if(c.dir) await fs.rm(c.dir, {recursive: true});
}
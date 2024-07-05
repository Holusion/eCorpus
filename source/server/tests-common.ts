import fs from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";

//@ts-ignore
import sourceMaps from "source-map-support";
import { AppLocals } from "./utils/locals.js";
import { Config, parse } from "./utils/config.js";
sourceMaps.install();

chai.use(chaiAsPromised);

process.env["TEST"] ??= "true";

declare global{
  var dataStream:(src ?:Array<Buffer|string>)=>AsyncGenerator<Buffer, void, unknown>;
  var expect :typeof chai["expect"];
  var createIntegrationContext :(c:Mocha.Context, config_override ?:Partial<Config>)=>Promise<AppLocals>;
  var cleanIntegrationContext :(c:Mocha.Context)=>Promise<void>;
}

global.expect = chai.expect;

global.dataStream = async function* (src :Array<Buffer|string> =["foo", "\n"]){
  for(let d of src){
    let b = Buffer.isBuffer(d)?d: Buffer.from(d);
    yield await Promise.resolve(b);
  }
}

global.createIntegrationContext = async function(c :Mocha.Context, config_override :Partial<Config>={}){
  let {default:createServer} = await import("./routes/index.js");
  let titleSlug = c.currentTest?.title.replace(/[^\w]/g, "_") ?? `eThesaurus_integration_test`;
  c.dir = await fs.mkdtemp(path.join(tmpdir(), titleSlug));
  c.config = Object.assign(
    parse({ //Common options
    ROOT_DIR: c.dir, CLEAN_DATABASE: "false", VERBOSE: "false", HOT_RELOAD: "false",
    }),
    //Options we might want to customize
    config_override
  );
  c.server = await createServer( c.config );
  return c.server.locals;
}

global.cleanIntegrationContext = async function(c :Mocha.Context){
  if(c.dir) await fs.rm(c.dir, {recursive: true});
}
import path from "path";
import fs from 'fs/promises';
import os from 'os';
import { fileURLToPath } from 'node:url';
import { TaskLogger } from "../../types.js";
import { debuglog, format } from "util";


import { fixturesDir } from "../../../__test_fixtures/fixtures.js";
import { convertModelFile } from "./convert.js";
import { constants } from "node:fs/promises";


const thisDir = path.dirname(fileURLToPath(import.meta.url));
const scripts_dir = path.resolve(thisDir, "../../../scripts");

const debug = debuglog("tasks:logs");

describe("convertModelFile()", function(){
  let logger :TaskLogger&{lines:Array<{level: string, message: string}>};
  let mainTmpDir: string, tmpdir :string;
  this.beforeAll(async function(){
    mainTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ecorpus-gltf-transform-tests-"));
  });
  
  this.beforeEach(async function(){
    function _write(level:string, ...args:any[]){
      debug(`[${level}] ${format(...args)}`);
      logger.lines.push({ level, message:format(...args) }); 
    } 
    logger = {
      lines: [],
      debug: _write.bind(this, "debug"),
      log: _write.bind(this, "log"),
      warn: _write.bind(this, "warn"),
      error: _write.bind(this, "error"),
    } satisfies typeof logger;

    tmpdir = await fs.mkdtemp(path.join(mainTmpDir, "test-"));
  });

  this.afterAll(async function(){
    if(mainTmpDir) await fs.rm(mainTmpDir, {recursive: true});
  })

  const inputFile = path.join(fixturesDir, "cube.obj");
  
  it("converts an obj to glb", async function(){
    this.timeout(10000);
    const outputFile = path.join(tmpdir, "cube.glb");
    await convertModelFile({
      scripts_dir,
      tmpdir,
      inputFile,
      outputFile,
      backface: false,
    });

    await fs.access(outputFile, constants.R_OK);
    
  });
})
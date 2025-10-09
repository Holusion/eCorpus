
import { expect } from "chai";
import path  from "path";
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import os from "os";

const thisFile = fileURLToPath(import.meta.url);

import { fixturesDir } from "../../../__test_fixtures/fixtures.js";
import { ILogger } from "@gltf-transform/core";
import { transformGlb } from "./transform.js";
import { TaskLogger } from "../../types.js";
import { debuglog } from "util";

const debug = debuglog("gltf:transform");


const models = (await fs.readdir(fixturesDir)).filter(f=> f.endsWith("glb")).map(f=>path.join(fixturesDir, f));

describe("transformGlb", function(){
  let logger :TaskLogger&{lines:Array<{level: string, message: string}>};
  let mainTmpDir: string, tmpdir :string;
  this.beforeAll(async function(){
    mainTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ecorpus-gltf-transform-tests-"));
  })


  this.beforeEach(async function(){
    function _write(level:string, message:string){
      debug(`[${level}] ${message}`);
      logger.lines.push({ level, message }); 
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

  models.forEach(m=>{
    const name = path.basename(m);
    it("optimize "+name, async function(){
      let result = await transformGlb(m, {
        tmpdir,
        logger,
        simplify: {
          ratio: 0,
          error: 0.001,
          lockBorders: true,
        },
        size: 8,
      });
    })
  })

})
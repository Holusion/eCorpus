
import { expect } from "chai";
import path  from "path";
import fs from 'fs/promises';
import os from "os";

import { fixturesDir } from "../../../__test_fixtures/fixtures.js";
import { ILogger } from "@gltf-transform/core";
import { processGlb } from "./transform.js";
import { TaskLogger } from "../../types.js";
import { debuglog, format } from "util";

const debug = debuglog("tasks:logs");


const models = (await fs.readdir(fixturesDir)).filter(f=> f.endsWith("glb")).map(f=>path.join(fixturesDir, f));

describe("transformGlb()", function(){
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

  models.forEach(m=>{
    const name = path.basename(m);
    it("optimize "+name, async function(){
      let outputFile = await processGlb(m, {
        tmpdir,
        logger,
        preset: "High",
        resize: false,
      });

      expect(outputFile).to.be.a("string");
      expect(outputFile.endsWith(".glb"), `${outputFile} should end with .glb`).to.be.true;
    })
  })

});

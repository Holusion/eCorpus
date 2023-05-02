import fs from "fs/promises";
import path from "path";
import {tmpdir} from "os";
import Vfs from ".";
import UserManager from "../auth/UserManager";
import { performance } from "perf_hooks";

/* Test structures */
type Context = Awaited<ReturnType<typeof commonSetup>>;
type TestCallback =(ctx :Context)=>Promise<string|void>;
type TestCase = Array<TestCallback|string>;


type GlobalContext = {dir:string, file:string};

async function globalSetup(){
  const dir = await fs.mkdtemp(path.join(tmpdir(), `vfs_benchmarks`));
  const vfs = await Vfs.Open(dir);
  const userManager = new UserManager(vfs._db);
  await userManager.addUser("alice", "xxxxxxxx", true);
  await userManager.addUser("bob", "xxxxxxxx", false);

  await enableWAL({vfs});
  await addIndices({vfs});
  await createScenes({vfs});

  let file = await vfs._db.config.filename;
  await vfs.close();
  return {dir, file} as GlobalContext;
}

async function globalTearDown(c :GlobalContext){
  await fs.rm(c.dir, {recursive:true});
}

/** Basic set-up required for all tests */
async function commonSetup(c :GlobalContext){
  const dir = await fs.mkdtemp(path.join(c.dir, `vfs_benchmarks`));
  const id = path.basename(dir);
  await fs.copyFile(c.file, path.join(dir, path.basename(c.file)));

  const vfs = await Vfs.Open(dir);

  const userManager = new UserManager(vfs._db);
  let admin = await userManager.getUserByName("alice");
  let user = await userManager.getUserByName("bob");

  return {
    id,
    dir,
    vfs,
    userManager,
    admin,
    user,
  };
}

/** Basic tear-down for all tests */
async function commonTearDown(ctx :Context){
  await ctx.vfs.close();
  await fs.rm(ctx.dir, {recursive: true});
}

/** Simplified test runner */
async function run(c : GlobalContext, ...args :TestCase){
  let test = args.pop();
  if(typeof test !== "function") throw new Error("Bad test case");
  let ctx = await commonSetup(c);
  let testDesc :string[] = [];
  try{
    for(let fn of args){
      if(typeof fn === "string") testDesc.push(fn);
      else await fn(ctx);
    }
    let start = performance.now();
    let res = await test(ctx);
    if(typeof res !== "undefined") testDesc.push(res);
    let title = testDesc.pop();
    console.log(`| ${title?.padEnd(58, " ")}| ${timeString(start).padStart(6)}|`, ...testDesc);
  }finally{
    await commonTearDown(ctx);
  }
}

let size = 200;

function timeString(start :number) :string{
  let time = performance.now() - start;
  let unit = (1000 <= time)?"s" : "ms";
  return `${Math.round(((unit==="ms"?1 : 0.001)*time)*100)/100}${unit}`;
}


/** WAL is generally disabled in dev environments but enabled in large production workloads */
async function enableWAL(c :{vfs:Vfs}){
  await c.vfs._db.run(`PRAGMA journal_mode = WAL`);
}

async function optimize(fn:(c :{vfs:Vfs})=>Promise<any>, c:{vfs:Vfs}){
  await fn(c);
  await c.vfs._db.exec(`ANALYZE;`);
}

/** create a bunch of scenes with some documents in it */
async function createScenes(c :{vfs:Vfs}){
  for(let i = 0; i < size; i++){
    let start = performance.now();
    let times = [];
    let scene = `foo-${i.toString().padStart(3, "0")}`;
    await c.vfs.createScene(scene);
    times.push(`scene: ${timeString(start)}`);
    start = performance.now();

    for(let j = 0; j < size/5; j++){
      await c.vfs.createFile({
        scene,
        name: `articles/hello-world-${j.toString().padStart(5,"0")}.html`,
        mime: "text/html",
        user_id: 0,
      }, {
        hash: "014Iy1l4FXSbu6gkdBb7bO-bSTEehmP4e55_Ebf8Big",
        size: 16,
      });
    }
    times.push(`file: ${timeString(start)}`);
    start = performance.now();

    for(let j = 0; j < size; j++){
      await c.vfs.writeDoc(`{"id":"${j.toString().padStart(5, "0")}"}`, scene, 0);
    }
    times.push(`docs: ${timeString(start)}`);
    start = performance.now();
    //if(i % 100 == 0) console.log("Created %dth", i, times.join(" "));
  }
}

/** Create custom indices */
async function addIndices(c :{vfs: Vfs}){
  await c.vfs._db.exec(`
    DROP INDEX scenenames; -- auto created on UNIQUE constraint
    
    -- was missing from initial declaration
    CREATE UNIQUE INDEX docs_uid ON documents(fk_scene_id, generation DESC);

    CREATE INDEX files_path ON files(fk_scene_id, name);
  `);
}

let cases :TestCase[] = [
  [`get ${size} scenes`, async (c :Context)=>{
    await c.vfs.getScenes(c.user.uid);
  }],
  [`search ${size} scenes`, async (c :Context)=>{
    await c.vfs.getScenes(c.user.uid, {match: "foo-00"});
  }],
  [`get a scene`, async (c :Context)=>{
    await c.vfs.getScene("foo-005");
  }],
  [`get a scene's history`, async (c :Context)=>{
    let s = await c.vfs.getScene("foo-005");
    await c.vfs.getSceneHistory(s.id);
  }],
  ["(optimized) get a scene's history", optimize.bind(null, async (c)=>{
    let s = await c.vfs.getScene("foo-005");
    await c.vfs.getSceneHistory(s.id);
  }), async function(c){
    let s = await c.vfs.getScene("foo-005");
    await c.vfs.getSceneHistory(s.id);
  }],
  ["get a document", async (c :Context)=>{
    let s = await c.vfs.getScene("foo-005");
    await c.vfs.getDoc(s.id);
  }],
  ["get a file", async (c :Context)=>{
    await c.vfs.getFileProps({scene: "foo-010", name:"articles/hello-world-00005.html"});
  }],
];

/** BOOTSTRAP */
(async ()=>{
  let c = await globalSetup();
  process.on("SIGINT",()=>{
    globalTearDown(c).then(()=>process.exit(127));
  });
  console.log("Setup done. Running tests.");
  try{
    for(let t of cases){
      await run(c, ...t);
    }
  }finally{
    await globalTearDown(c);
  }
})();
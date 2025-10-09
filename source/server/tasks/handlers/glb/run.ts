
import {spawn, SpawnOptionsWithoutStdio} from "node:child_process";
import { once } from "node:events";



export async function run(cmd: string, args:string[], opts?: SpawnOptionsWithoutStdio):Promise<{code: number, stdout: string,stderr:string}>{
  let child = spawn(cmd, args, opts);
  
  let stdout:string = "";
  let stderr:string = "";
  child.stdout.setEncoding("utf-8");
  child.stdout.on("data", (chunk)=>stdout+= chunk);
  child.stderr.setEncoding("utf-8");
  child.stderr.on("data", (chunk)=>stderr+= chunk);

  try{
    let [code, signal] = await once(child, "close");
    if(typeof code !== "number"){
      let e: any = new Error(`Command ${cmd} was interrupted by signal ${signal}`);
      e.stdout = stdout;
      e.stderr = stderr;
      throw e;
    }
    return {code, stdout, stderr};
  }finally{
    child.stdout.removeAllListeners();
    child.stderr.removeAllListeners();
  }
}
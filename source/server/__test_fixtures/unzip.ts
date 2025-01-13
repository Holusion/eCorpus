import { execFile, spawn } from "node:child_process";
import { once } from "node:events";

/**
 * Checks a zip file's validity
 */
export function verifyZip(file :string) :Promise<string>{
  return new Promise((resolve, reject)=>{
    execFile("unzip", ["-t", file], (error, stdout, stderr)=>{
      stdout = stdout.replace(/^Archive:\s*.*\n/m, "").replace(/At least one error was detected.*\n/m, "");
      if(error){
        reject(new Error(`unzip failed with code ${error.code}:\n${stdout}`))
      }
      resolve(stdout);
    });
  })
}

interface ZipOptions{
  compression?: "store"|"deflate";
}

export async function externalZip(archive: string, opts:ZipOptions,...paths:string[]) :Promise<string>
export async function externalZip(archive: string, ...paths:string[]) :Promise<string>
export async function externalZip(archive: string, optsOrPath :ZipOptions|string, ...paths:string[]) :Promise<string>{
  const opts = {
    compression: "store",
  }
  if(typeof optsOrPath == "object"){
    Object.assign(opts, optsOrPath);
  }else{
    paths.unshift(optsOrPath);
  }

  let child = spawn("zip", [
    "-r",
    "--compression-method", opts.compression, 
    archive,
    ...paths
  ]);

  let b = "";
  child.stdout.setEncoding("utf-8")
  child.stdout.on("data", (chunk)=>{
    b += chunk;
  });
  child.stderr.setEncoding("utf-8")
  child.stderr.on("data", (chunk)=>{
    b += chunk;
  });

  await once(child, "close");
  return b;
}

/**
 * Check if `unzip` is available on this system
 */
export async function canUnzip() :Promise<void>{
  return await new Promise((resolve, reject)=>{
    execFile("unzip", ["-v"], (error)=>{
      if(error) reject(error);
      else resolve();
    });
  });
}
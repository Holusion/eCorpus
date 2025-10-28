
import {spawn, SpawnOptionsWithoutStdio} from "node:child_process";
import { once } from "node:events";
import { TaskLogger } from "./types.js";



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

interface RunCommandOpts extends SpawnOptionsWithoutStdio{
  logger: TaskLogger;
}
/**
 * Run a command with a {@link TaskLogger} instrumentation
 */
export async function taskRun(cmd: string, args: string[], {logger, ...opts}:RunCommandOpts):Promise<void>{
  let child = spawn(cmd, args, opts);
  
  child.stdout.setEncoding("utf-8");
  child.stdout.on("data", (chunk)=>logger.debug(chunk));
  child.stderr.setEncoding("utf-8");
  child.stderr.on("data", (chunk)=>logger.warn(chunk));

  try{
    let [code, signal] = await once(child, "close");
    if(typeof code !== "number"){
      let e: any = new Error(`Command ${cmd} was interrupted by signal ${signal}`);
      throw e;
    }else if(code != 0){
      throw new Error(`Command ${cmd} exitted with non-zero error code: ${code}`);
    }
  }finally{
    child.stdout.removeAllListeners();
    child.stderr.removeAllListeners();
  }
}

export async function getKtxVersion(): Promise<string> {

	const {stdout, stderr} = await run('ktx', ['--version']);

	const version = ((stdout || stderr) as string)
		.replace(/ktx version:\s+/, '')
		.replace(/~\d+/, '')
		.trim();

	if (!version) {
		throw new Error(
			`Unable to find "ktx" version. Confirm KTX-Software is installed.`,
		);
	}
	return version;
}

export async function getBlenderVersion(): Promise<string> {

	const {stdout, stderr} = await run('blender', ['--version']);

	const versionMatch = stdout.match(/^Blender (\d+.\d+.\d+[^\s]*)/gm);

	if (!versionMatch) {
		throw new Error(
			`Unable to find "blender" version. Confirm Blender is installed.`,
		);
	}
	return versionMatch[1];
}

/**
 * 
 * @param script absolute path to python script to load
 * @param scriptArgs script arguments
 * @param params Spawn parameters
 * @returns 
 */
export async function runBlenderScript(script: string, scriptArgs: string[], params:RunCommandOpts){
    return await taskRun("blender", [
      "--background",
      "--offline-mode",
      "--factory-startup",
      "--threads", "4",
      "--addons", "io_scene_gltf2",
      "--python", script,
      "--",
      ...scriptArgs
    ], params);
}
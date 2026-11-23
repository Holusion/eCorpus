import path from "node:path";
import { FileArtifact, TaskHandlerParams } from "../types.js";
import { BadRequestError, InternalError } from "../../utils/errors.js";
import { localize } from "../../utils/i18n.js";
import { run, ExecError, parseLogLine, type LogRecord } from "../../utils/exec.js";
import { meshtinker, MeshtinkerError, type InspectNoDataReport } from "../../utils/meshtinker.js";


/** Extensions of the formats mesh2gltf converts */
export const mesh2gltfExtensions: readonly string[] = [".obj", ".ply", ".wrl", ".vrml"];

/** Extensions of the files `mesh2gltf --inspect` reads: the ones that refer to other files */
export const mesh2gltfInspectExtensions: readonly string[] = [".obj", ".mtl", ".ply"];
/** Extensions of the files `meshtinker inspect --no-data` reads */
export const meshtinkerInspectExtensions: readonly string[] = [".gltf", ".glb"];

/**
 * What inspecting a model's file alone tells:
 * - `requires`: for each file it refers to, the paths the conversion looks for it at, in order, relative to its folder.
 *   A requirement is met by the first of its paths that exists.
 * - `reason`: why the conversion will reject it, safe to show to whoever supplied it.
 */
export type Inspection = {requires: string[][]} | {reason: string};

/** Whether `paths` is a list of lists of paths */
function isPathLists(paths: unknown): paths is string[][]{
  return Array.isArray(paths) && paths.every(r=>Array.isArray(r) && r.every(p=>typeof p === "string"));
}

/**
 * Run mesh2gltf with `--log-format json`, passing each message on to `onLog` as it comes.
 * @returns its exit code, what it wrote on stdout,
 * and why a failed run failed: its error messages, else its last message. Safe to show to whoever supplied the model.
 * @throws when mesh2gltf can't be run (`ENOENT` if it is not installed), or is killed
 */
async function mesh2gltf(args: string[], {signal, onLog}: {signal?: AbortSignal, onLog?: (record: LogRecord)=>void}): Promise<{code: number, stdout: string, reason: string}>{
  const stdout: string[] = [];
  const errors: string[] = [];
  let last: LogRecord|undefined;
  let code = 0;
  try{
    for await (const {fd, line} of run("mesh2gltf", ["--log-format", "json", ...args], {signal})){
      if(fd === "stdout"){
        stdout.push(line);
        continue;
      }
      if(!line.trim()) continue;
      last = parseLogLine(line);
      if(last.level === "error" || last.level === "fatal") errors.push(last.message);
      onLog?.(last);
    }
  }catch(e){
    if(!(e instanceof ExecError) || e.code === null) throw e;
    code = e.code;
  }
  return {
    code,
    stdout: stdout.join("\n"),
    reason: (errors.length ? errors.join(" ") : last?.message) || `exit code ${code}`,
  };
}

/**
 * Inspect a model's file, alone: the files it refers to needn't exist yet.
 * `.obj`, `.mtl` and `.ply` with `mesh2gltf --inspect`, `.gltf` and `.glb` with `meshtinker inspect --no-data`.
 * Every texture is required, as the conversion needs them all.
 * @param root the folder the file's references must stay in, which holds it. Defaults to the file's folder.
 *   Paths are still relative to the file's folder, so they may start with `..` (only with mesh2gltf for now: a glTF is always its model's root).
 * @returns undefined when it can't be inspected: not a format they inspect,
 * or the tool is missing, too old, or failed for a reason that's not about the file.
 */
export async function inspectModelFile(file: string, {signal, root}: {signal?: AbortSignal, root?: string} = {}): Promise<Inspection|undefined>{
  const ext = path.extname(file).toLowerCase();
  const name = path.basename(file);
  if(meshtinkerInspectExtensions.includes(ext)){
    try{
      const report = await meshtinker<InspectNoDataReport>("inspect", ["--no-data", file], {signal});
      if(!isPathLists(report.requires)) throw new Error(`unexpected report: ${JSON.stringify(report).slice(0, 200)}`);
      return {requires: report.requires};
    }catch(e: any){
      if(e instanceof MeshtinkerError && e.rejected) return {reason: e.message};
      //Exit code 2 is a meshtinker that has no --no-data
      console.warn("Can't inspect %s: %s", name, e.message);
      return undefined;
    }
  }
  if(!mesh2gltfInspectExtensions.includes(ext)) return undefined;
  let result: Awaited<ReturnType<typeof mesh2gltf>>;
  try{
    result = await mesh2gltf(["--inspect", ...(root ? ["--root", root] : []), file], {signal});
  }catch(e: any){
    console.warn("Can't inspect %s: %s", name, e.code === "ENOENT" ? "mesh2gltf is not installed" : e.message);
    return undefined;
  }
  if(result.code === 1) return {reason: result.reason};
  if(result.code !== 0){
    //2 is a mesh2gltf that has no --inspect, or no --root
    console.warn("Can't inspect %s (mesh2gltf exit code %d): %s", name, result.code, result.reason);
    return undefined;
  }
  try{
    const {requires} = JSON.parse(result.stdout);
    if(!isPathLists(requires)) throw new Error(`unexpected output: ${result.stdout.slice(0, 200)}`);
    return {requires};
  }catch(e: any){
    console.warn("Can't inspect %s: %s", name, e.message);
    return undefined;
  }
}

/**
 * Convert a model to GLB. The files it refers to must be in its folder.
 * @throws {BadRequestError} if the model's format is not supported
 */
export async function toGlb({context: {tasks}, task:{data:{fileLocation}}}:TaskHandlerParams<FileArtifact>): Promise<FileArtifact>{
  const ext = path.extname(fileLocation).toLowerCase();
  if(mesh2gltfExtensions.includes(ext)){
    return await tasks.run({
      handler: meshToGlb,
      data: {fileLocation},
    });
  }else if(ext === ".gltf"){
    return await tasks.run({
      handler: gltfToGlb,
      data: {fileLocation},
    });
  }else{
    throw new BadRequestError(`Unsupported file extension: ${ext}`);
  }
}

/** Name of the GLB made from a model: the model's name, with a .glb extension */
function glbName(fileLocation: string){
  return (path.basename(fileLocation).replace(/\.[^.]*$/, "") || "model") + ".glb";
}

/**
 * Convert an OBJ, PLY or VRML model to GLB with mesh2gltf.
 * It may only read files inside the model's folder.
 *
 * mesh2gltf's messages can be shown to whoever supplied the model: they name files, never folders.
 * Its exit code tells whether the model is at fault (1) or the machine is (anything else).
 */
export async function meshToGlb({context: {vfs, logger, signal}, task: {task_id, data:{fileLocation}}}:TaskHandlerParams<FileArtifact>):Promise<FileArtifact>{
  const filename = path.basename(fileLocation);
  const dir = await vfs.createTaskWorkspace(task_id);
  const dest = path.join(dir, glbName(fileLocation));

  let result: Awaited<ReturnType<typeof mesh2gltf>>;
  try{
    result = await mesh2gltf([vfs.absolute(fileLocation), "-o", dest], {
      signal,
      onLog: ({level, message}) => logger[level](message),
    });
  }catch(e: any){
    if(e.code === "ENOENT") throw new InternalError(`mesh2gltf is not installed: ${filename} can't be converted`);
    throw e;
  }
  if(result.code !== 0){
    const message = localize("errors.upload.convertFailed", { filename, reason: result.reason });
    //Codes 3 and 4 are about the machine, 101 is a crash: the model may be fine.
    throw result.code === 1 ? new BadRequestError(message) : new InternalError(message);
  }
  return {
    fileLocation: vfs.relative(dest),
  };
}


/**
 * Pack a glTF and the files it refers to into a GLB, with meshtinker:
 * `import` into a chain, then `export` it as a GLB.
 * Like mesh2gltf, it may only read files inside the model's folder, and every texture must be there.
 */
export async function gltfToGlb({context: {vfs, logger, signal}, task: {task_id, data:{fileLocation}}}:TaskHandlerParams<FileArtifact>):Promise<FileArtifact>{
  const filename = path.basename(fileLocation);
  const dir = await vfs.createTaskWorkspace(task_id);
  const chain = path.join(dir, "chain");
  const dest = path.join(dir, glbName(fileLocation));
  try{
    await meshtinker("import", [vfs.absolute(fileLocation), chain], {signal, logger});
    await meshtinker("export", ["--remove-chain", chain, dest], {signal, logger});
  }catch(e: any){
    if(!(e instanceof MeshtinkerError)) throw e;
    const message = localize("errors.upload.convertFailed", { filename, reason: e.message });
    throw e.rejected ? new BadRequestError(message) : new InternalError(message);
  }
  return {
    fileLocation: vfs.relative(dest),
  };
}

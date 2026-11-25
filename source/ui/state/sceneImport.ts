import HttpError from "./HttpError";

/**
 * What Voyager Story's import menu (see composants/StoryImportMenu.ts) guesses from a set of files,
 * and how it writes files that aren't converted into the scene.
 */

/** Models the server converts, on top of glb itself (see isModelType in the server's filetypes.ts) */
export const modelExtensions = ["glb", "obj", "ply", "wrl", "vrml", "gltf"];
/** Images Voyager uses as environment maps, overlays or image planes */
export const imageExtensions = ["jpg", "jpeg", "png", "hdr"];

function hasExtension(path: string, extensions: string[]){
  const lower = path.toLowerCase();
  return extensions.some(ext=>lower.endsWith("." + ext));
}
export function isModel(path: string){
  return hasExtension(path, modelExtensions);
}
export function isImage(path: string){
  return hasExtension(path, imageExtensions);
}
/** An HDR image is only good as an environment map */
export function isHdr(path: string){
  return hasExtension(path, ["hdr"]);
}

function depth(path: string){
  return path.split("/").length;
}

/**
 * What a set of files is guessed to be for:
 * - `model`: the shallowest model (then the first by name), with the other files in its folder or below.
 *   Other models are flagged: only one is imported at a time.
 * - `image`: a single image, that may be an environment map, an overlay, an image plane or a file of the scene
 * - `files`: anything else, added to the scene's files as it is
 * - `none`: no files
 */
export type ImportPlan =
  | {kind: "model", main: string, prefix: string}
  | {kind: "image", image: string}
  | {kind: "files"}
  | {kind: "none"};

/** @param paths the files' paths, with `/` separators */
export function planImport(paths: Iterable<string>): ImportPlan{
  const all = Array.from(paths);
  const models = all.filter(isModel).sort((a, b)=>depth(a) - depth(b) || a.localeCompare(b));
  if(models.length){
    const main = models[0];
    const i = main.lastIndexOf("/");
    return {kind: "model", main, prefix: i === -1 ? "" : main.slice(0, i + 1)};
  }
  if(all.length === 1 && isImage(all[0])) return {kind: "image", image: all[0]};
  if(all.length) return {kind: "files"};
  return {kind: "none"};
}

function sceneFileUrl(scene: string, path: string){
  return `/scenes/${encodeURIComponent(scene)}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Write a file into a scene, at `path` or, if a file is there already, at the first free `name-N.ext` beside it:
 * an import never replaces a file of the scene.
 * @returns the path it was written at, relative to the scene's root
 */
export async function putSceneFile(scene: string, path: string, file: File, {signal}: {signal?: AbortSignal} = {}): Promise<string>{
  const dot = path.lastIndexOf(".");
  const [base, ext] = dot > path.lastIndexOf("/") ? [path.slice(0, dot), path.slice(dot)] : [path, ""];
  for(let i = 0; i < 100; i++){
    const candidate = i ? `${base}-${i}${ext}` : path;
    const head = await fetch(sceneFileUrl(scene, candidate), {method: "HEAD", signal, cache: "no-store"});
    if(head.ok) continue;
    if(head.status !== 404) await HttpError.okOrThrow(head);
    const res = await fetch(sceneFileUrl(scene, candidate), {method: "PUT", signal, body: file});
    await HttpError.okOrThrow(res);
    return candidate;
  }
  throw new Error(`No free name for ${path}`);
}

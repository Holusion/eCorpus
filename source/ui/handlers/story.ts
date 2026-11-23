import HttpError from "../state/HttpError";
import { uploadFiles, UploadEntry } from "../state/uploads";

/**
 * Voyager Story's model uploader: model files dropped in the editor go through `/uploads`,
 * then the server makes a derivative of each chosen quality into the scene.
 *
 * Loaded after voyager-story.js, with the scene's name as `data-scene`.
 */

// Voyager's contract (source/voyager/source/client/io/ModelUploader.ts).
// Repeated here: Voyager's sources don't resolve from this project's tsconfig.
interface ModelUploadProgress{
  phase: "upload" | "process";
  loaded?: number;
  total?: number;
  quality?: string;
}
interface ModelUploadRequest{
  file: File;
  /** Files the model may refer to, by path relative to its folder. Only those it refers to are sent. */
  resources: Map<string, File>;
  /** From lowest to highest */
  qualities: string[];
  /** When false, the highest quality is the model as sent. The others are always optimized */
  optimize: boolean;
  path: string;
  signal: AbortSignal;
  onProgress(progress: ModelUploadProgress): void;
}
interface ModelUploader{
  accept?: string[];
  upload(request: ModelUploadRequest): Promise<{derivatives: Array<{quality: string, uri: string}>}>;
}


/** Formats the server converts to glb, on top of glb itself (see isModelType in the server's filetypes.ts). */
const accept = ["obj", "ply", "wrl", "vrml", "gltf"];

export function createModelUploader(scene: string): ModelUploader{
  return {
    accept,
    async upload({file, resources, qualities, optimize, signal, onProgress}){
      const candidates: UploadEntry[] = Array.from(resources ?? [], ([path, file])=>({path, file}));
      //Only the files the model refers to are sent
      const {task, unused, missing} = await uploadFiles({path: file.name, file}, candidates, {
        scene,
        signal,
        onProgress: (loaded, total)=>onProgress({phase: "upload", loaded, total}),
      });
      if(unused.length) console.info("%s doesn't refer to %s: not sent", file.name, unused.map(e=>e.path).join(", "));
      //The conversion fails with a message that names them
      if(missing.length) console.warn("%s refers to files that weren't given:", file.name, missing.map(paths=>paths[0]));
      onProgress({phase: "process"});
      //All at once: the model is converted only once
      const res = await fetch(`/uploads/${task.task_id}/derivatives`, {
        method: "POST",
        signal,
        headers: {"Accept": "application/json", "Content-Type": "application/json"},
        body: JSON.stringify({usage: "Web3D", qualities, optimize}),
      });
      await HttpError.okOrThrow(res);
      const {output} = await res.json();
      const derivatives = output?.derivatives;
      if(!Array.isArray(derivatives) || !derivatives.every(d=>typeof d?.uri === "string" && typeof d?.quality === "string")){
        console.warn("Unexpected derivatives output:", output);
        throw new Error("Invalid response body");
      }
      return {derivatives: derivatives.map(({quality, uri}: {quality: string, uri: string})=>({quality, uri}))};
    },
  };
}


const scene = (document.currentScript as HTMLScriptElement|null)?.dataset.scene;
const story = document.querySelector("voyager-story") as (HTMLElement & {modelUploader?: ModelUploader}) | null;

if(!scene || !story){
  console.warn("Voyager Story's model uploader isn't set: no scene or no <voyager-story> element");
}else if(story.getAttribute("mode") === "Standalone"){
  //Files stay in the browser
}else{
  story.modelUploader = createModelUploader(scene);
}

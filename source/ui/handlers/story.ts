import HttpError from "../state/HttpError";
import { uploadFiles, UploadEntry } from "../state/uploads";

/**
 * Voyager Story's model uploader: model files dropped in the editor go through `/uploads`,
 * then the server makes a derivative of each chosen quality into the scene, one after the other.
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
    async upload({file, resources, qualities, signal, onProgress}){
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
      //One at a time, lowest first: each one is a full optimization
      const derivatives: Array<{quality: string, uri: string}> = [];
      for(const quality of qualities){
        onProgress({phase: "process", quality});
        const res = await fetch(`/uploads/${task.task_id}/derivatives/Web3D/${encodeURIComponent(quality)}`, {
          method: "PUT",
          signal,
          headers: {"Accept": "application/json"},
        });
        await HttpError.okOrThrow(res);
        const {output} = await res.json();
        if(typeof output?.uri !== "string"){
          console.warn("Unexpected derivative output:", output);
          throw new Error("Invalid response body");
        }
        derivatives.push({quality, uri: output.uri});
      }
      return {derivatives};
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

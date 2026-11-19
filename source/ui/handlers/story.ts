import HttpError from "../state/HttpError";
import { uploadFile } from "../state/uploads";

/**
 * Voyager Story's model uploader: model files dropped in the editor go through `/uploads`,
 * then the server makes the derivative of the chosen quality into the scene.
 *
 * Loaded after voyager-story.js, with the scene's name as `data-scene`.
 */

// Voyager's contract (source/voyager/source/client/io/ModelUploader.ts).
// Repeated here: Voyager's sources don't resolve from this project's tsconfig.
interface ModelUploadProgress{
  phase: "upload" | "process";
  loaded?: number;
  total?: number;
}
interface ModelUploadRequest{
  file: File;
  quality: string;
  path: string;
  signal: AbortSignal;
  onProgress(progress: ModelUploadProgress): void;
}
interface ModelUploader{
  accept?: string[];
  upload(request: ModelUploadRequest): Promise<{uri: string}>;
}


/** Formats the server converts to glb, on top of glb itself (see isModelType in the server's filetypes.ts). */
//.gltf comes with other files (.bin, textures): Voyager uploads those as-is.
const accept = ["obj", "stl", "ply", "blend"];

export function createModelUploader(scene: string): ModelUploader{
  return {
    accept,
    async upload({file, quality, signal, onProgress}){
      const upload = await uploadFile(file, {
        scene,
        signal,
        onProgress: (loaded, total)=>onProgress({phase: "upload", loaded, total}),
      });
      onProgress({phase: "process"});
      const res = await fetch(`/uploads/${upload.task_id}/derivatives/Web3D/${encodeURIComponent(quality)}`, {
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
      return {uri: output.uri};
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

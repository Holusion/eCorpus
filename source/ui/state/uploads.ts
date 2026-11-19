import HttpError from "./HttpError";

/**
 * Requests of the `/uploads` API, shared by the uploads dashboard (see uploader.ts)
 * and Voyager Story's model uploader (see handlers/story.ts).
 */

// That's still way above nginx's 1mb default
export const CHUNK_SIZE = 25_000_000;

/** Error of an upload request. `code` is the HTTP status, or a DOMException code */
export class UploadError extends Error{
  code: number;
  constructor(code: number, message: string, name?: string){
    super(message);
    this.code = code;
    if(name) this.name = name;
  }
}

export interface CreateUploadParams{
  filename: string;
  size: number;
  /** Target scene: derivatives can be made from the upload, into this scene */
  scene?: string;
}

/**
 * Create an upload that waits for its data
 * @returns the upload's id
 */
export async function createUpload({filename, size, scene}: CreateUploadParams, {signal}: {signal?: AbortSignal} = {}): Promise<number>{
  const res = await fetch(`/uploads`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({filename, size, scene}),
  });
  await HttpError.okOrThrow(res);
  const body = await res.json();
  if(typeof body.task_id !== "number"){
    console.warn("Can't use body:", body);
    throw new HttpError(500, "Server answered with an unreadable task identifier");
  }
  return body.task_id;
}


export interface SendChunkParams{
  id: number;
  file: Blob;
  /** First byte of the chunk */
  start: number;
  /** Byte after the chunk's last one */
  end: number;
  signal?: AbortSignal;
  /** Bytes of the whole file sent so far */
  onProgress?: (loaded: number)=>void;
}

/** A chunk was received. When it was the last one, the upload's settled task comes with it */
export type SendChunkResult = {done: false} | {done: true, task: any};

/**
 * Send one chunk of an upload's data.
 * Rejects with an {@link UploadError}: its code is DOMException.NETWORK_ERR when the server could not be reached,
 * and its name "AbortError" when the signal is aborted.
 */
export function sendChunk({id, file, start, end, signal, onProgress}: SendChunkParams): Promise<SendChunkResult>{
  return new Promise((resolve, reject)=>{
    if(signal?.aborted) return reject(new UploadError(DOMException.ABORT_ERR, "Upload was aborted", "AbortError"));
    const xhr = new XMLHttpRequest();
    const abort = ()=>xhr.abort();
    signal?.addEventListener("abort", abort);
    const settle = ()=>signal?.removeEventListener("abort", abort);

    xhr.onload = ()=>{
      settle();
      if(299 < xhr.status){
        let message = xhr.statusText;
        const contentType = xhr.getResponseHeader("Content-Type") || "";
        try{
          if(contentType.includes("application/json")){
            const fail_response = JSON.parse(xhr.responseText) as {message?: string};
            if(fail_response.message) message = fail_response.message;
          }else if(xhr.responseText){
            message = xhr.responseText.slice(0, 300);
          }
        }catch(e){
          console.warn("Unreadable error response:", xhr.responseText);
        }
        return reject(new UploadError(xhr.status, message));
      }
      if(xhr.status !== 201) return resolve({done: false});
      try{
        resolve({done: true, task: JSON.parse(xhr.responseText)});
      }catch(e){
        console.warn("Unreadable upload response:", xhr.responseText);
        reject(new UploadError(500, "Invalid response body"));
      }
    };
    xhr.upload.onprogress = (evt)=>{
      if(evt.lengthComputable) onProgress?.(start + evt.loaded);
    };
    xhr.onerror = ()=>{
      settle();
      reject(new UploadError(xhr.status || DOMException.NETWORK_ERR, xhr.statusText || (navigator.onLine ? "Server is unreachable" : "Disconnected")));
    };
    xhr.onabort = ()=>{
      settle();
      reject(new UploadError(DOMException.ABORT_ERR, "Upload was aborted", "AbortError"));
    };

    xhr.open("PUT", new URL(`/uploads/${id}`, window.location.href));
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("Content-Range", `bytes ${start}-${end-1}/${file.size}`);
    xhr.send(file.slice(start, end));
  });
}


export interface UploadFileOptions{
  /** Target scene of the upload */
  scene?: string;
  signal?: AbortSignal;
  /** Bytes sent so far, out of the file's size */
  onProgress?: (loaded: number, total: number)=>void;
}

/**
 * Upload a file in one go: create the upload, then send its chunks one after the other.
 * Resolves with the upload's settled task, rejects on the first error.
 */
export async function uploadFile(file: File, {scene, signal, onProgress}: UploadFileOptions = {}): Promise<any>{
  const id = await createUpload({filename: file.name, size: file.size, scene}, {signal});
  try{
    for(let start = 0; start < file.size; start += CHUNK_SIZE){
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const result = await sendChunk({id, file, start, end, signal, onProgress: (loaded)=>onProgress?.(loaded, file.size)});
      onProgress?.(end, file.size);
      if(result.done) return result.task;
    }
    throw new UploadError(500, `Upload ${id} wasn't completed by its last chunk`);
  }catch(e){
    //Don't keep the staged data of an abandoned upload
    if((e as Error)?.name === "AbortError"){
      fetch(`/tasks/${id}`, {method: "DELETE"}).catch(err=>console.warn("Failed to remove upload %d:", id, err));
    }
    throw e;
  }
}

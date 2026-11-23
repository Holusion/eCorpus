import HttpError from "./HttpError";

/**
 * Requests of the `/uploads` API, shared by the uploads dashboard (see uploader.ts)
 * and Voyager Story's model uploader (see handlers/story.ts).
 *
 * An upload is a set of files with one entry point, its `main` file:
 * a model and the files it refers to, in their folders.
 * 1. `POST /uploads` creates it ({@link createUpload})
 * 2. `PUT /uploads/:id/files/*path` sends each file, in chunks ({@link sendChunk}).
 *    A model's file is inspected once complete: the server tells which files it refers to ({@link FileInspection}),
 *    and only those are sent along ({@link followInspection}).
 * 3. `POST /uploads/:id/process` parses its main file once every file is sent ({@link processUpload})
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

/** A file of an upload */
export interface UploadEntry{
  /** Path relative to the upload's root, with `/` separators */
  path: string;
  file: File;
}

/** Files that make one upload */
export interface UploadGroup{
  /** Path of the entry point, among `entries` */
  main: string;
  /** Where the main file was, among the files it was grouped from */
  source: string;
  /** The main file, then files it may refer to */
  entries: UploadEntry[];
}

/** A path with `/` separators and no leading or trailing separator, as it is in an upload */
export function normalizePath(p: string): string{
  return p.split(/[\\/]+/).filter(s=>s && s !== ".").join("/");
}

function dirname(p: string): string{
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i);
}

/**
 * Split a set of files into uploads:
 * one per model, with every other file in the model's folder or below as candidates, with paths relative to the model's folder.
 * It's what a model may refer to: the server's converters can't read outside of the model's folder.
 * Which candidates are actually sent is decided as the model's files are inspected (see {@link followInspection}).
 * Files that are in no model's folder make an upload of their own.
 *
 * Other files of a folder are candidates of each of its models: they may need them.
 * Self-contained models (`.glb`) get no candidates.
 * @param files files by path, eg. `scan/model.obj`. Leading separators are ignored
 * @param isModel whether a file is a model that may refer to other files
 */
export function groupUploads(files: Iterable<{path: string, file: File}>, isModel: (path: string)=>boolean): UploadGroup[]{
  const all = Array.from(files, ({path, file})=>({path: normalizePath(path) || file.name, file}));
  const models = all.filter(e=>isModel(e.path));
  const others = all.filter(e=>!isModel(e.path));
  const claimed = new Set<UploadEntry>();
  const groups: UploadGroup[] = [];

  for(const model of models){
    const dir = dirname(model.path);
    const prefix = dir ? `${dir}/` : "";
    const rel = (p: string)=> p.slice(prefix.length);
    const entries: UploadEntry[] = [{path: rel(model.path), file: model.file}];
    if(!/\.glb$/i.test(model.path)){
      for(const other of others){
        if(!other.path.startsWith(prefix)) continue;
        entries.push({path: rel(other.path), file: other.file});
        claimed.add(other);
      }
    }
    groups.push({main: rel(model.path), source: model.path, entries});
  }
  for(const other of others){
    if(claimed.has(other)) continue;
    const name = other.path.slice(dirname(other.path).length).replace(/^\//, "");
    groups.push({main: name, source: other.path, entries: [{path: name, file: other.file}]});
  }
  return groups;
}


/**
 * Throws an {@link UploadError} for a failed response
 */
async function okOrThrow(res: Response){
  if(res.ok) return;
  let message = res.statusText;
  try{
    const contentType = res.headers.get("Content-Type") || "";
    if(contentType.includes("application/json")){
      const body = await res.json();
      if(body?.message) message = body.message;
    }else{
      const text = await res.text();
      if(text) message = text.slice(0, 300);
    }
  }catch(e){
    console.warn("Unreadable error response:", e);
  }
  throw new UploadError(res.status, message);
}

export interface CreateUploadParams{
  /** Target scene: derivatives can be made from the upload, into this scene */
  scene?: string;
}

/**
 * Create an upload that waits for its files
 * @returns the upload's id
 */
export async function createUpload({scene}: CreateUploadParams = {}, {signal}: {signal?: AbortSignal} = {}): Promise<number>{
  const res = await fetch(`/uploads`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(scene ? {scene} : {}),
  });
  await HttpError.okOrThrow(res);
  const body = await res.json();
  if(typeof body.task_id !== "number"){
    console.warn("Can't use body:", body);
    throw new HttpError(500, "Server answered with an unreadable task identifier");
  }
  return body.task_id;
}

/** URL of a file of an upload */
function fileUrl(id: number, path: string){
  return new URL(`/uploads/${id}/files/${normalizePath(path).split("/").map(encodeURIComponent).join("/")}`, window.location.href);
}


/**
 * What the server tells of a complete model's file (`.obj`, `.mtl`, `.ply`, `.gltf`, `.glb`)
 * - `requires`: for each file it refers to, the paths it would be found at, in order, relative to the upload's root.
 *   The first of them that is in the upload is used.
 * - `error`: why it can't be converted, translated
 */
export type FileInspection = {requires: string[][]} | {error: string};

/** Response to the chunk that completes a file */
export interface CompleteFile{
  path: string;
  size: number;
  /** Missing when the file isn't a model's file, or when the server couldn't inspect it */
  inspection?: FileInspection;
}

/**
 * Files to send for a complete file's requirements, taken from `candidates`, in the order of the first path of each requirement that exists.
 * A file that's inspected adds what it requires.
 * A main file that's not inspected (a `.wrl`, or a server that can't) adds all its candidates: it may refer to any of them.
 * @param sent files of the upload that are sent, or will be: they meet requirements too
 * @param candidates files that may be sent. Those that are needed are removed from it.
 * @returns the files to send, and requirements that no file meets
 * @throws {UploadError} if the file can't be converted
 */
export function followInspection(
  inspection: FileInspection|undefined,
  {isMain, sent, candidates}: {isMain: boolean, sent: readonly UploadEntry[], candidates: UploadEntry[]},
): {found: UploadEntry[], missing: string[][]}{
  if(!inspection){
    return {found: isMain ? candidates.splice(0) : [], missing: []};
  }
  if(!("requires" in inspection)) throw new UploadError(400, inspection.error);
  const found: UploadEntry[] = [];
  const missing: string[][] = [];
  for(const paths of inspection.requires){
    let met = false;
    for(const p of paths){
      if(sent.some(e=>e.path === p) || found.some(e=>e.path === p)){
        met = true;
        break;
      }
      const i = candidates.findIndex(e=>e.path === p);
      if(i === -1) continue;
      found.push(...candidates.splice(i, 1));
      met = true;
      break;
    }
    if(!met) missing.push(paths);
  }
  return {found, missing};
}


export interface SendChunkParams{
  id: number;
  /** Path of the file, relative to the upload's root */
  path: string;
  file: Blob;
  /** First byte of the chunk */
  start: number;
  /** Byte after the chunk's last one */
  end: number;
  signal?: AbortSignal;
  /** Bytes of the whole file sent so far */
  onProgress?: (loaded: number)=>void;
}

/**
 * Send one chunk of an upload's file. Resolves with whether the file is now complete, and if it is, what the server tells of it.
 * Rejects with an {@link UploadError}: its code is DOMException.NETWORK_ERR when the server could not be reached,
 * and its name "AbortError" when the signal is aborted.
 */
export function sendChunk({id, path, file, start, end, signal, onProgress}: SendChunkParams): Promise<{complete: false}|{complete: true, body: CompleteFile}>{
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
      if(xhr.status !== 201) return resolve({complete: false});
      let body: CompleteFile = {path, size: file.size};
      try{
        if(xhr.responseText) body = JSON.parse(xhr.responseText);
      }catch(e){
        console.warn("Unreadable response for %s:", path, xhr.responseText);
      }
      resolve({complete: true, body});
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

    xhr.open("PUT", fileUrl(id, path));
    xhr.setRequestHeader("Accept", "application/json");
    //An empty file can't be given as a range
    if(file.size) xhr.setRequestHeader("Content-Range", `bytes ${start}-${end-1}/${file.size}`);
    xhr.send(file.slice(start, end));
  });
}

/**
 * Send a whole file of an upload, in chunks
 * @param onProgress bytes of the file sent so far
 * @returns what the server tells of the complete file
 */
export async function sendFile(id: number, {path, file}: UploadEntry, {signal, onProgress}: {signal?: AbortSignal, onProgress?: (loaded: number)=>void} = {}): Promise<CompleteFile>{
  let start = 0;
  do{
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const res = await sendChunk({id, path, file, start, end, signal, onProgress});
    onProgress?.(end);
    if(res.complete) return res.body;
    start = end;
  }while(start < file.size);
  throw new UploadError(500, `${path} wasn't completed by its last chunk`);
}

/**
 * Process an upload once all its files are sent: the server parses its main file.
 * Resolves with the processed upload's task. Rejects with an {@link UploadError}
 */
export async function processUpload(id: number, main: string, {signal}: {signal?: AbortSignal} = {}): Promise<any>{
  const res = await fetch(`/uploads/${id}/process`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({main: normalizePath(main)}),
  });
  await okOrThrow(res);
  return await res.json();
}

/** Remove an upload's data from the server, once it won't be used */
export function deleteUpload(id: number){
  fetch(`/tasks/${id}`, {method: "DELETE"}).catch(err=>console.warn("Failed to remove upload %d:", id, err));
}


export interface UploadFilesOptions{
  /** Target scene of the upload */
  scene?: string;
  signal?: AbortSignal;
  /** Bytes sent so far, out of the size of the files to send. It grows as the files that are needed are known */
  onProgress?: (loaded: number, total: number)=>void;
}

export interface UploadFilesResult{
  /** The processed upload's task */
  task: any;
  /** Files that were sent, the main file first */
  sent: UploadEntry[];
  /** Candidates that no file needed: they weren't sent */
  unused: UploadEntry[];
  /** Requirements no file met, as the paths they'd be found at */
  missing: string[][];
}

/**
 * Upload a model in one go: create the upload, send its main file, then the files it needs among `candidates`
 * (see {@link followInspection}), then process it.
 * Rejects on the first error, which may be that the model can't be converted.
 */
export async function uploadFiles(main: UploadEntry, candidates: readonly UploadEntry[], {scene, signal, onProgress}: UploadFilesOptions = {}): Promise<UploadFilesResult>{
  const pool = [...candidates];
  const sent: UploadEntry[] = [main];
  const missing: string[][] = [];
  const id = await createUpload({scene}, {signal});
  try{
    let loaded = 0;
    for(let i = 0; i < sent.length; i++){
      const entry = sent[i];
      const total = ()=>sent.reduce((sum, {file})=>sum + file.size, 0);
      const {inspection} = await sendFile(id, entry, {signal, onProgress: (l)=>onProgress?.(loaded + l, total())});
      loaded += entry.file.size;
      const next = followInspection(inspection, {isMain: i === 0, sent, candidates: pool});
      sent.push(...next.found);
      missing.push(...next.missing);
    }
  }catch(e){
    //Don't keep the staged data of an upload that won't be processed
    deleteUpload(id);
    throw e;
  }
  const task = await processUpload(id, main.path, {signal});
  return {task, sent, unused: pool, missing};
}


/**
 * Files of a drop, with their path among what was dropped: folders are walked.
 * Must be called while the drop event is dispatched: its items are gone after it.
 */
export function readDroppedFiles(dataTransfer: DataTransfer): Promise<UploadEntry[]>{
  //Read synchronously, while the event is dispatched
  const roots = Array.from(dataTransfer.items ?? [])
    .filter(item=>item.kind === "file")
    .map(item=>item.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry=>!!e);
  const files = Array.from(dataTransfer.files ?? []);
  if(!roots.length) return Promise.resolve(files.map(file=>({path: file.name, file})));

  async function walk(entry: FileSystemEntry): Promise<UploadEntry[]>{
    if(entry.isFile){
      const file = await new Promise<File>((resolve, reject)=>(entry as FileSystemFileEntry).file(resolve, reject));
      return [{path: normalizePath(entry.fullPath), file}];
    }
    if(!entry.isDirectory) return [];
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const children: FileSystemEntry[] = [];
    //readEntries gives entries in batches, until an empty one
    for(;;){
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject)=>reader.readEntries(resolve, reject));
      if(!batch.length) break;
      children.push(...batch);
    }
    return (await Promise.all(children.map(walk))).flat();
  }
  return Promise.all(roots.map(walk)).then(r=>r.flat());
}

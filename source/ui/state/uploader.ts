import { ReactiveController, ReactiveControllerHost } from "lit";
import { CHUNK_SIZE, createUpload, followInspection, groupUploads, processUpload, sendChunk, UploadEntry } from "./uploads";
import { Localization } from "./translate";

export type SceneUploadResult = {name: string, action: "create"|"update"|"error"}

/** Localized entry of an upload result. `message` is translated by the server for this request */
export interface UploadMessage{
  key: string;
  params?: Record<string, unknown>;
  message: string;
}


/**
 * Files that may be models, which may refer to other files.
 * The server tells what they actually are once they're processed (`isModel`).
 */
export function isModelPath(path: string): boolean{
  return /\.(?:glb|gltf|obj|ply|wrl|vrml)$/i.test(path);
}

/**
 * An upload of a set of files: a main file, and the files it refers to.
 * Files are sent one after the other, then the upload is processed.
 * The main file is sent first: the server tells which files it refers to, and those are taken from `candidates`.
 * Then the files they refer to, and so on.
 */
export interface UploadOperation{
  /** Unique ID of the upload: path of its main file, among the files that were given */
  id: string;
  /** Name of the main file */
  filename: string;
  /** Path of the main file in the upload */
  main: string;
  /** Where the upload's root was among the files that were given, eg. `scan/`, or an empty string */
  root: string;
  /** Files to send, the main file first. Files it needs are added as they're known */
  entries: UploadEntry[];
  /**
   * Files that may be needed, not sent yet. Those that are still there once every file is sent
   * are given back: they make uploads of their own, if no other upload needs them.
   */
  candidates: UploadEntry[];
  /**
   * Files that a file of the upload refers to, and that none of its files meet.
   * Another upload may bring them: see {@link Uploader.missingFiles}.
   */
  missing: MissingFile[];
  /** Number of `entries` completely sent */
  sentFiles: number;
  /** Bytes of the file being sent that the server has received */
  offset: number;
  mime?: string;
  isModel?: boolean;
  /** When the file is an archive we will store the list of files it contains here */
  files?:string[];
  scenes?: SceneUploadResult[];
  warnings?: UploadMessage[];
  messages?: UploadMessage[];
  //An array to be able to show a list of imported scenes in case of zip uploads
  error ?:{code?:number, name?: string, message:string};
  done :boolean;
  active ?:boolean;
  task_id?:number;
  total ?:number;
  progress :number;
  signal: AbortSignal;
  abort: ()=>void;
}

/** A file that a file of an upload refers to */
export interface MissingFile{
  /** Where it would be found, in order, relative to the upload's root */
  paths: string[];
  /** Path of the file that refers to it, in the upload */
  from: string;
}

export interface ParsedUploadTaskOutput{
  warnings?: UploadMessage[],
  messages?: UploadMessage[],
  mime: string,
  scenes?: SceneUploadResult[],
  files?: string[],
}


export class Uploader implements ReactiveController{
  host: ReactiveControllerHost;
  /**
   * List of upload operations
   * Shouldn't be mutated as it will trigger an update when reassigned
   */
  uploads: readonly UploadOperation[] = [];
  has_pending_uploads: boolean = false;
  has_errors: boolean = true;


  get size(){
    return this.uploads.length;
  }

  hostConnected() {
    //Initialize
    this.uploads = [];
    window.addEventListener("online", this.handleGlobalOnline);
  }

  hostDisconnected() {
    // Clear uploads when host disconnects
    for(let op of this.uploads){
      op.abort();
    }
    this.uploads = [];
    window.removeEventListener("online", this.handleGlobalOnline);
  }

  constructor(host: ReactiveControllerHost){
    (this.host = host).addController(this);
    //Make a closure around uploads list to prevent mutation
    let _uploads : readonly UploadOperation[] = [];
    const self = this;
    Object.defineProperties(this, {
      "uploads": {
        get() {
          return _uploads;
        },
        set(value){
          if(_uploads === value) return
          _uploads = value;
          self.has_pending_uploads = self.uploads.some(u=>!u.done && !u.error );
          self.has_errors = self.uploads.some(u=>!!u.error && u.error.name !== "AbortError" );
          self.processUploads();
          self.host?.requestUpdate();
        }
      }
    })
  }

  /**
   * Amend a running download operation
   * @param name scene name that uniquely identifies the operation
   * @param changes partial object to merge into operation
   */
  protected splice(id: string, changes?: Partial<UploadOperation>) {
    this.uploads = this.uploads.map(current => {
      if (current.id !== id) return current;
      else if (changes && current) return { ...current, ...changes };
      else return undefined;
    }).filter(u=>!!u);
  }

  public remove(id: string){
    let size = this.uploads.length;
    this.uploads = this.uploads.map(current => {
      if (current.id !== id) return current;
      else return undefined;
    }).filter(u=>!!u);
    return size != this.uploads.length;
  }

  public reset(){
    this.uploads = [];
  }

  /**
   * Listen for the global "online" event to resume downloads that had a NETWORK_ERR
   */
  private handleGlobalOnline = ()=>{
    this.uploads = this.uploads.map(u=>{
      if(u.error && u.error.code == DOMException.NETWORK_ERR) return {...u, error: undefined};
      else return u;
    });
    this.processUploads();
  }

    /**
   * Handles a list of files that was submitted through dragdrop or the file input.
   * Each model makes one upload, with the files of its folder (see {@link groupUploads}).
   * @param files Files, or files with their path among what was dropped (eg. `scan/tex/diffuse.jpg`)
   */
  public handleFiles(files: Iterable<File|UploadEntry>): void{
    const entries = Array.from(files, (f)=> f instanceof File ? {path: f.webkitRelativePath || f.name, file: f} : f);
    const uploads = new Map<string, UploadOperation>(this.uploads.map(u=>([u.id, u])));
    for(const group of groupUploads(entries, isModelPath)){
      const prev = uploads.get(group.source);
      if(prev){
        if(!prev.done && ! prev.error) prev.abort();
        // @fixme remove from server?
        uploads.delete(group.source);
      }
      const main = group.entries.find(e=>e.path === group.main)!;
      const root = group.source.slice(0, group.source.length - group.main.length);
      uploads.set(group.source, this.createUploadOperation(group.source, main, group.entries.filter(e=>e !== main), root));
    }
    this.uploads = Array.from(uploads.values());
  }

  protected createUploadOperation(id: string, main: UploadEntry, candidates: UploadEntry[], root: string) :UploadOperation{
    const c = new AbortController();
    const task :UploadOperation = {
      id,
      filename: main.file.name,
      main: main.path,
      root,
      entries: [main],
      candidates,
      missing: [],
      sentFiles: 0,
      offset: 0,
      done: false,
      active: false,
      progress: 0,
      total: main.file.size,
      signal: c.signal,
      abort: ()=> {
        c.abort();
        this.splice(id, {error: {name: "AbortError", message: "Upload was aborted"}});
      }
    };
    return task;
  }


  /**
   * Give back the candidates of an upload that no file of it needed.
   * Those no other upload has, or may still need, make uploads of their own.
   */
  private releaseCandidates(id: string){
    const op = this.uploads.find(u=>u.id === id);
    if(!op) return;
    const uploads = this.uploads.map(u=> u.id === id ? {...u, candidates: []} : u);
    for(const {path, file} of op.candidates){
      const source = op.root + path;
      if(uploads.some(u=>u.id === source || u.entries.some(e=>e.file === file) || u.candidates.some(e=>e.file === file))) continue;
      const [group] = groupUploads([{path: source, file}], isModelPath);
      uploads.push(this.createUploadOperation(group.source, group.entries[0], [], source.slice(0, source.length - group.main.length)));
    }
    this.uploads = uploads;
  }

  /**
   * Files that an upload's files refer to, and that no upload brings.
   * A scene is made from all uploads, side by side (`createSceneFromFiles`):
   * a file of another upload, at the same path, is found by the conversion.
   * Uploads that failed don't make it into the scene.
   */
  public missingFiles(op: UploadOperation): MissingFile[]{
    if(!op.missing.length) return [];
    const others = this.uploads.filter(u=>u !== op && !u.error);
    return op.missing.filter(({paths})=>!others.some(u=>u.entries.some(e=>paths.includes(e.path))));
  }

  /** Warnings for the files an upload misses (see {@link missingFiles}) */
  public missingFileWarnings(op: UploadOperation): UploadMessage[]{
    return this.missingFiles(op).map(({paths, from})=>{
      const params = {path: paths[0], file: from.split("/").pop()};
      return {key: "missingUploadFile", params, message: Localization.Instance.getString("info.missingUploadFile", params)};
    });
  }

  /**
   * Read the processed upload from the response to its last chunk
   */
  parseUploadResult(body: any) :ParsedUploadTaskOutput{
    if(!body?.output || typeof body.output !== "object" || !body.output.mime){
      console.warn("Unexpected format for upload output:", body);
      throw new Error("Invalid response body");
    }
    return body.output;
  }

  
  /**
   * Process queued uploads up to a max of 5 concurrent requests
   */
  private processUploads(){
    const inFlight = this.uploads.filter(u=>u.active && (!u.done && !u.error)).length;
    if(2 <= inFlight) return;
    const task = this.uploads.find(u=>!u.active && !u.done && !u.error);
    if(!task) return;

    //Every file is sent: what wasn't needed is given back. It triggers another call.
    if(typeof task.task_id !== "undefined" && task.entries.length <= task.sentFiles && task.candidates.length){
      return this.releaseCandidates(task.id);
    }

    const update :((changes :Partial<UploadOperation>)=>void) = this.splice.bind(this, task.id);
    const setError = (err: Error|{code: number, message: string})=>{
      console.error("Upload request failed :", err);
      update({active: false, error: err});
    }
    update({active: true});
    //Initialize upload
    if(typeof task.task_id === "undefined"){
      createUpload({}, {signal: task.signal}).then(
        (id)=> update({active: false, task_id: id}),
        setError,
      );
      return;
    }

    //All files are sent: process the upload
    if(task.entries.length <= task.sentFiles){
      processUpload(task.task_id, task.main, {signal: task.signal}).then((body)=>{
        const output = this.parseUploadResult(body);
        console.debug("Processed upload. Parsed content :", output);
        update({active: false, done: true, ...output});
      }).catch(setError);
      return;
    }

    //Send the next chunk of the current file
    const {path, file} = task.entries[task.sentFiles];
    const sentBytes = task.entries.slice(0, task.sentFiles).reduce((sum, e)=>sum + e.file.size, 0);
    const start = task.offset;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    sendChunk({
      id: task.task_id,
      path,
      file,
      start,
      end,
      signal: task.signal,
      onProgress: (loaded)=> update({progress: sentBytes + loaded}),
    }).then((res)=>{
      if(!res.complete) return update({active: false, offset: end, progress: sentBytes + end});
      //The files the complete file needs are to be sent too
      const candidates = [...task.candidates];
      const {found, missing} = followInspection(res.body.inspection, {isMain: task.sentFiles === 0, sent: task.entries, candidates});
      const entries = [...task.entries, ...found];
      update({
        active: false,
        sentFiles: task.sentFiles + 1,
        offset: 0,
        progress: sentBytes + file.size,
        entries,
        candidates,
        total: entries.reduce((sum, e)=>sum + e.file.size, 0),
        missing: [...task.missing, ...missing.map(paths=>({paths, from: path}))],
      });
    }).catch((err)=>{
      //Resume from what the server has confirmed
      update({progress: sentBytes + start});
      setError(err);
    });
  }
}

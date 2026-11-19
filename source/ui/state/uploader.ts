import { ReactiveController, ReactiveControllerHost } from "lit";
import { toast } from "./toast";
import { CHUNK_SIZE, createUpload, sendChunk } from "./uploads";

export type SceneUploadResult = {name: string, action: "create"|"update"|"error"}

/** Localized entry of an upload result. `message` is translated by the server for this request */
export interface UploadMessage{
  key: string;
  params?: Record<string, unknown>;
  message: string;
}


export interface UploadOperation{
  //Unique ID of the upload. Might be different from "name" when we upload a scene zip
  id: string;
  filename: string;
  mime?: string;
  isModel?: boolean;
  /** The file to upload. Should be required? */
  file?: File;
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
   * Handles a list of files that was submitted through dragdrop or the file input
   * @param files 
   */
  public handleFiles(files: Iterable<File>): void{
    const uploads = new Map<string, UploadOperation>(this.uploads.map(u=>([u.id, u])));
    for(let file of files){
      console.log("Handle file : ", file);
      const prev = uploads.get(file.name);
      if(prev){
        if(!prev.done && ! prev.error) prev.abort();
        // @fixme remove from server?
        uploads.delete(file.name);
      }

      uploads.set(file.name, this.createUploadOperation(file));
    }
    this.uploads = Array.from(uploads.values());
  }

  protected createUploadOperation(file: File) :UploadOperation{
    const c = new AbortController();
    const task :UploadOperation = {
      id: file.name,
      filename: file.name,
      file,
      done: false,
      active: false,
      progress: 0,
      total: file.size,
      signal: c.signal,
      abort: ()=> {
        c.abort();
        this.splice(file.name, {error: {name: "AbortError", message: "Upload was aborted"}});
      }
    };
    return task;
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

    if(!task.file){
      toast(`Can't upload : No file provided`, "error", 4000);
      return;
    }

    const starting_offset = task.progress;
    const end_offset = Math.min(task.progress+CHUNK_SIZE, task.total ?? 0)

    const update :((changes :Partial<UploadOperation>)=>void) = this.splice.bind(this, task.id);
    const setError = (err: Error|{code: number, message: string})=>{
      console.error("Upload request failed :", err);
      update({active: false, progress: starting_offset, error: err});
    }
    update({active: true});
    //Initialize upload
    if(typeof task.task_id === "undefined"){
      createUpload({filename: task.filename, size: task.total}, {signal: task.signal}).then(
        (id)=> update({active: false, task_id: id}), 
        setError,
      );
      return;
    }

    sendChunk({
      id: task.task_id,
      file: task.file,
      start: starting_offset,
      end: end_offset,
      signal: task.signal,
      onProgress: (progress)=> update({progress}),
    }).then((result)=>{
      if(!result.done){
        console.debug("Chunk uploaded. Set progress to :", end_offset);
        return update({active: false, progress: end_offset});
      }
      const output = this.parseUploadResult(result.task);
      console.debug("Finalized upload task. Parsed content :", output);
      update({active: false, progress: task.total, done: true, ...output});
    }).catch(setError);
  }
}

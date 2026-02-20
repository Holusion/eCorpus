import { ReactiveController, ReactiveControllerHost } from "lit";
import HttpError from "./HttpError";
import Notification from "../composants/Notification";

export type SceneUploadResult = {name: string, action: "create"|"update"|"error"}


// @FIXME use more like 100MB in production
const CHUNK_SIZE = 10000000;

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
  uploads: readonly UploadOperation[];
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
    Object.defineProperties(this,{
      "uploads": {
        get() {
          return _uploads;
        },
        set(value){
          if(_uploads === value) return
          _uploads = value;
          this.has_pending_uploads = this.uploads.some(u=>!u.done && !u.error );
          this.has_errors = this.uploads.some(u=>!!u.error && u.error.name !== "AbortError" );
          this.processUploads();
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
        this.splice(file.name, {error: {message: "Upload was aborted"}});
      }
    };
    return task;
  }


  async initUpload(task: UploadOperation) :Promise<number>{
    console.debug("Initializing upload task for %s", task.filename);

    const res = await fetch(`/tasks`, {
      method: "POST",
      signal: task.signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "parseUserUpload",
        status: "initializing",
        data:{
          filename: task.filename,
          size: task.total,
        }
      }),
    });
    await HttpError.okOrThrow(res);
    const body = await res.json()
    if(typeof body.task_id !== "number"){
      console.warn("Can't use body:", body);
      throw new HttpError(500,  "Server answered with an unreadable task identifier");
    }
    return body.task_id;
  }


  async finalizeUpload(task: UploadOperation) :Promise<ParsedUploadTaskOutput>{
    const res = await fetch(`/tasks/${task.task_id}`, {
      method: "GET",
      headers:{"Content-Type": "application/json"},
    });
    await HttpError.okOrThrow(res);
    const body = await res.json();
    if(!body?.task?.output || typeof body.task.output !== "object" || !body.task.output.mime){
      console.warn("Unexpected format for scene output:", body);
      throw new Error("Invalid response body");
    }

    return body.task.output;
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
      Notification.show(`Can't upload : No file provided`, "error", 4000);
      return;
    }

    const starting_offset = task.progress;
    const end_offset = Math.min(task.progress+CHUNK_SIZE, task.total)
    const chunk = task.file.slice(task.progress, end_offset);

    const update :((changes :Partial<UploadOperation>)=>void) = this.splice.bind(this, task.id);
    const setError = (err: Error|{code: number, message: string})=>{
      console.error("Upload request failed :", err);
      update({active: false, progress: starting_offset, error: err});
    }
    update({active: true});
    //Initialize upload
    if(typeof task.task_id === "undefined"){
      this.initUpload(task).then(
        (id)=> update({active: false, task_id: id}), 
        setError,
      );
      return;
    }

    let xhr = new XMLHttpRequest();
    task.signal.addEventListener("abort", xhr.abort)
    xhr.onload = ()=>{
      if (299 < xhr.status) {
        const fail_response = JSON.parse(xhr.responseText) as { message?: string };
        console.error("Upload Request failed :", fail_response.message ? fail_response.message : xhr.statusText)
        setError({code: xhr.status, message: fail_response.message ? fail_response.message : xhr.statusText});
      }else if(xhr.status === 201){
        this.finalizeUpload(task).then((output)=>{
          console.debug("Finalized upload task. Parsed content :", output);
          update({active: false, progress: task.total, done: true, ...output});
        }, setError);
      }else{
        console.debug("Chunk uploaded. Set progress to :", end_offset);
        update({active: false, progress: end_offset});
      }
    }

    xhr.upload.onprogress = (evt)=>{
        if(evt.lengthComputable){
          console.debug("Progress event : %d (%d)", starting_offset + evt.loaded, evt.loaded);
          update({progress: starting_offset + evt.loaded});
        }
    }
    xhr.ontimeout = function(ev){
      console.log("XHR Timeout", ev);
    }
    xhr.onerror = function onUploadError(ev){
      console.log("XHR Error", ev);
      setError({ code: xhr.status ||DOMException.NETWORK_ERR, message: xhr.response.message || xhr.statusText || navigator.onLine? "Server is unreachable": "Disconnected" });
    }

    xhr.onabort = function onUploadAbort(){
      setError({ code: 20, name: "AbortError", message: "Upload was aborted"});
    }

    let url = new URL(`/tasks/${task.task_id}/artifact`, window.location.href);


    xhr.open('PUT', url);
    xhr.setRequestHeader("Content-Range", `bytes ${starting_offset}-${end_offset-1}/${task.total}`);
    xhr.send(chunk);
  }


}
import { css, html, LitElement, PropertyValues, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";

import Notification from "./Notification";
import { formatBytes, binaryUnit } from "./Size";
import HttpError from "../state/HttpError";

// @FIXME use more like 100MB in production
const CHUNK_SIZE = 10000000;

type SceneUploadResult = {name: string, action: "create"|"update"|"error"}

interface UploadOperation{
  //Unique ID of the upload. Might be different from "name" when we upload a scene zip
  id: string;
  filename: string;
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

interface ParsedUploadTaskOutput{
  scenes: SceneUploadResult[],
  files: string[],
}


@customElement("upload-manager")
export default class UploadManager extends LitElement{
  //static shadowRootOptions = {...LitElement.shadowRootOptions, delegatesFocus: true};

  /**
   * List of upload operations
   * We use an array instead of a Map or Set because we expect this list to stay stable through updates
   */
  @state()
  uploads :readonly UploadOperation[] = [];

  @state()
  busy: boolean = false;

  connectedCallback(): void {
    super.connectedCallback();
    // We register a number of global events that might influence app behaviour
    window.addEventListener("drop", this.handleGlobalDrop);
    window.addEventListener("dragover", this.handleGlobalDragover);
    window.addEventListener("online", this.handleGlobalOnline);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("drop", this.handleGlobalDrop);
    window.removeEventListener("dragover", this.handleGlobalDragover);
    window.removeEventListener("online", this.handleGlobalOnline);
  }

  /**
   * Prevent default action on drop at the window level when files are dropped in the page
   */
  private handleGlobalDrop = (e: DragEvent)=>{
    if(e.defaultPrevented) return;
    if([...e.dataTransfer.items].every((item) => item.kind !== "file")) return;
    e.preventDefault();
    this.classList.remove("drag-active");
  }

  /**
   * Prevent default action on drop at the window level when files are dragged through the page
   */
  private handleGlobalDragover = (e: DragEvent)=>{
    if([...e.dataTransfer.items].every((item) => item.kind !== "file")) return;
    e.preventDefault();
    if (!this.shadowRoot.contains(e.target as Node)) {
      e.dataTransfer.dropEffect = "none";
    }
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
   * Remove a download operation
   * @param name scene name that uniquely identifies the operation
   */
  splice(id: string):void;
  /**
   * Amend a running download operation
   * @param name scene name that uniquely identifies the operation
   * @param changes partial object to merge into operation
   */
  splice(id: string, obj :Partial<UploadOperation>):void
  splice(id: string, changes?: Partial<UploadOperation>) {
    this.uploads = this.uploads.map(current => {
      if (current.id !== id) return current;
      else if (changes && current) return { ...current, ...changes };
      else return undefined;
    }).filter(u=>!!u);
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
    if(!body.output || typeof body.output !== "object" || !Array.isArray(body.output.scenes) || !Array.isArray(body.output.files)){
      console.warn("Unexpected format for scene output:", body);
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

  handleSubmit = (ev:MouseEvent)=>{
    ev.preventDefault();
    ev.stopPropagation();
    const form = this.uploadForm;
    const data= new FormData(form);
    if(!form.checkValidity()){
      Notification.show("Upload form is invalid", "warning", 1500);
      return;
    }
    console.log("Submit, form :", data, this.uploads);
    this.busy = true;
    fetch("/tasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        type: "processUploadedFiles",
        status: "pending", //Execute immediately
        data: {
          files: this.uploads.map(u=>u.task_id),
          scene: data.get("name"),
          lang: data.get("lang"),
        }
      })
    }).then(async (res)=>{
      await HttpError.okOrThrow(res);
    }).catch((e)=>{
      console.error(e);
      Notification.show(e.message, "error", 10000);
    }).finally(()=> this.busy = false);
    //Reset everything
    form.reset();
    return false;
  }


  protected uploadFile(file: File) :UploadOperation{
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

  /**
   * Handles a list of files that was submitted through dragdrop or the file input
   * @param files 
   */
  protected handleFiles(files: Iterable<File>): void{
    const uploads = new Map<string, UploadOperation>(this.uploads.map(u=>([u.id, u])));
    for(let file of files){
      console.log("Handle file : ", file);
      const prev = uploads.get(file.name);
      if(prev){
        if(!prev.done && ! prev.error) prev.abort();
        // @fixme remove from server?
        uploads.delete(file.name);
      }

      uploads.set(file.name, this.uploadFile(file));
    }
    this.uploads = Array.from(uploads.values());
  }

  /**
   * Handles files being dropped onto the upload zone
   * @fixme files is empty?
   */
  public ondrop = (ev: DragEvent)=>{
    ev.preventDefault();
    this.classList.remove("drag-active");
    console.log("Drop :", ev.dataTransfer.files);
    // @todo add the files
    this.handleFiles(ev.dataTransfer.files);
  }

  public ondragover = (ev: DragEvent)=>{
    ev.preventDefault();
    ev.dataTransfer.dropEffect = "copy";
    this.classList.add("drag-active");
  }

  public ondragleave = (ev: DragEvent)=>{
    this.classList.remove("drag-active");
  }

  /**
   * Handles "change" events in the file input
   * @param ev 
   */
  protected handleChange = (ev: Event)=>{
    ev.preventDefault();
    this.handleFiles((ev.target as HTMLInputElement).files);
  }

  /**
   * Proxy scene default title to prevent having to query slotted input repeatedly
   */
  private _defaultTitle: string = "";
  /**
   * slotted element selector to edit proposed scene title
   */
  get nameInput() :HTMLInputElement|undefined{
    const slot = this.shadowRoot.querySelector<HTMLSlotElement>('slot[name="upload-form"]');
    return slot?.assignedElements().map(e=> e.querySelector<HTMLInputElement>(`input[name="name"]`)).filter(n=>!!n)[0];
  }

  get uploadForm() :HTMLFormElement|undefined{
    const slot = this.shadowRoot.querySelector<HTMLSlotElement>('slot[name="upload-form"]');
    return slot?.assignedElements().map(e=> e instanceof HTMLFormElement? e: e.querySelector<HTMLFormElement>(`FORM`)).filter(n=>!!n)[0];
  }


  protected update(changedProperties: PropertyValues): void {
    if(changedProperties.has("uploads")){
      this.processUploads();
      if(this._defaultTitle == ""){
        const models = this.uploads.filter(u=>/\.(glb|gltf|blend|obj|stl|ply)$/i.test(u.filename));
        if(models.length  && !!this.nameInput){
          this._defaultTitle  = models[0].filename.split(".").slice(0, -1).join(".");
          if(this.nameInput?.value == "") this.nameInput.value = this._defaultTitle;
        }
      }
    }
    super.update(changedProperties);
  }

  /**
   * Renders an individual upload operation
   */
  private renderUploadItem = (u:UploadOperation)=>{
    const onActionClick = (ev: MouseEvent)=>{
      ev.preventDefault();
      ev.stopPropagation();
      if(u.error || u.done){
        u.task_id && fetch(`/tasks/${u.task_id}`, {method: "DELETE"})
          .then(res=> HttpError.okOrThrow(res))
          .catch(err=>{
            Notification.show(`Failed to delete upload task for ${u.filename}. Data may remain on the server`, "warning", 10000);
            console.warn(err)
          });
        this.splice(u.id);
      }else{
        console.log("Abort upload: ", u.id);
        u.abort();
      }
    }
    let state = "pending";
    let stateText: TemplateResult|string = html`<span class="loader"></span>`;
    let unit = binaryUnit(u.total);
    let progress = `${formatBytes(u.progress, unit)}/${formatBytes(u.total)}`;
    if(u.error){
      state = "error";
      stateText = "⚠";
      progress= `${u.error.message}`;
    }else if(u.done){
      state = "done";
      stateText = "✓";
      progress = formatBytes(u.total);
    }

    return html`
    <li class="upload-line upload-${state}">
      <span class="upload-state">${stateText}</span>
      <span class="upload-filename">${u.filename}</span>
      <span class="upload-progress">${progress}</span>
      <span class="upload-action action-cancel" title="${u.done?"remove":"abort"} upload" @click=${onActionClick}>🗙</span>
    </li>
  `;
  }

  /**
   * When it looks like the user is uploading model(s) for a scene creation, show this form.
   * The submit button is shown only when all uploads have settled.
   */
  private renderSceneCreationForm(){
    const has_pending_uploads = this.uploads.some(u=>!u.done && !u.error );
    const has_errors = this.uploads.some(u=>!!u.error && u.error.name !== "AbortError" );
    return html`<slot name="upload-form" ?disabled=${has_pending_uploads|| this.busy}></slot>
      <div class="submit-container" style="display:flex; justify-content: end; gap: .5rem;">
        ${(()=>{
          if(has_pending_uploads|| this.busy) return html`<span class="loader" style="width: 34px; height: 34px; --color-loader: var(--color-secondary);"></span>`
          else if(has_errors) return html`<slot name="upload-errors">Some uploads have failed</slot>`
          else if(this.uploads.length) return html`<slot name="submit" @click=${this.handleSubmit} ?disabled=${has_pending_uploads}><button>Submit</button></slot>`
          else return null;
        })()}
        
      </div>
    `;
  }

  /**
   * Renders the details of zipfiles contents
   */
  private renderScenesContentSummary(){
    return html`
      <slot name="scenes-list-title">Scenes:</slot>
      <ul class="scenes-list-actions">
        ${this.uploads.map(u=>(u.scenes?.map(s=>html`<li><span class="scene-action scene-action-${s.action}">[${s.action.toUpperCase()}]</span> ${s.name}</li>`)) ?? [])}
      </ul>
      <button>MAKE ME!</button>
    `;
  }

  /**
   * Prints a warning when mixed content prevents any action.
   */
  private renderMixedContentWarning(){
    return html`<slot name="mixed-content-warning">Mixed content: can't proceed. Remove some of the uploaded files.</slot>`;
  }

  protected render(): unknown {
    const is_active = this.uploads.some(u=>!u.done && !u.error );
    const scene_archives = this.uploads.filter(u=>u.scenes?.length);
    let form_content :TemplateResult|null = null;
    if(scene_archives.length && scene_archives.length == this.uploads.length){
      form_content = this.renderScenesContentSummary();
    }else if(scene_archives.length){
      form_content = this.renderMixedContentWarning();
    }else if(this.uploads.length){
      form_content = this.renderSceneCreationForm();
    }else{
      form_content = html`<slot name="upload-lead">Start uploading files in the box above.</slot>`
    }
    return html`
      <slot name="title"  id="upload-form-title">Create or Update a scene</slot>
      <div id="drop-zone" class="dropzone  ${is_active?" active":""}${this.uploads.length?"":" empty"}">
        <ul class="upload-list">
          ${this.uploads.map(this.renderUploadItem)}
        </ul>
        <label>
          <slot class="drop-label" name="drop-label">Drop files here</slot>
          <input @change=${this.handleChange}
            class="dropzone-input"
            role="button"
            id="fileUpload" 
            type="file"
            name="files"
            multiple
          />
        </label>
      </div>
      ${form_content}
    `;
  }

  static styles = [css`
    .dropzone{
      display: block;
      max-width: 100%;
      border: 1px solid #99999988;
      border-radius: 2px;
      transition: background-color .1s ease;
      &:hover{
        background-color: #99999910;
      }

      label {
        display: block;
        cursor: pointer;
        padding: 1rem;
      }
      input[type=file] {
        display: none;
      }
    }

    
    :host(.drag-active) .dropzone{
      border: 1px dotted #99999988;
      background-color: #99999905;
    }


    @keyframes l1 {
      0%  {background-size: 20% 100%,20% 100%,20% 100%}
      33% {background-size: 20% 10% ,20% 100%,20% 100%}
      50% {background-size: 20% 100%,20% 10% ,20% 100%}
      66% {background-size: 20% 100%,20% 100%,20% 10% }
      100%{background-size: 20% 100%,20% 100%,20% 100%}
    }
    
    .loader{
      display: block;
      width: 24px;
      height: 24px;
      aspect-ratio: 1;
      --c: no-repeat linear-gradient(var(--color-loader, var(--color-info)) 0 0);
      background: 
        var(--c) 0%   50%,
        var(--c) 50%  50%,
        var(--c) 100% 50%;
      background-size: 20% 100%;
      animation: l1 1s infinite linear;
    }
    
    .upload-list{
      max-width: 100%;
      margin: .25rem;
      padding: 0 .5rem;
      display: flex;
      flex-direction: column;
      gap: 3px;

      .upload-line{
        display: flex;
        justify-content: stretch;
        gap: .5rem;

        &:not(:last-child){
          border-bottom: 2px solid #00000010;
        }

        .upload-filename{
          flex-grow: 1;
        }

        .upload-state{
          width: 24px;
        }
        

        .upload-action{
          cursor: pointer;
          &.action-cancel{
            color: var(--color-error);
            &:hover{
              filter: saturate(0.6);
            }
          }
        }
        
        &.upload-done{
          .upload-state{
            color: var(--color-success);
          }
        }

        &.upload-error{
          color: var(--color-error);
        }
      }
    }
    .drop-label{
      opacity: 0;
      transition: opacity 0.2s ease;
      display: flex;
      justify-content: center;
    }
    
    .upload-list:empty ~ .drop-label,
    .dropzone.empty .drop-label {
      opacity: 1;
    }
    
    .dropzone:hover,
    :host(.drag-active) {
      .drop-label{
        opacity: 0.7;
      }
    }

    .scenes-list-actions{
      list-style: none;
      .scene-action{
        display: inline-block;
        min-width: 4.6rem;
      }
      .scene-action-create{
        color: var(--color-success);
      }
      .scene-action-update{
        color: var(--color-info);
      }
      .scene-action-error{
        color: var(--color-error);
      }
    }
  `];
}
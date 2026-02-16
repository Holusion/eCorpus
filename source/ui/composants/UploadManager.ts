import { css, html, LitElement, PropertyValues, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";

import Notification from "./Notification";
import { formatBytes, binaryUnit } from "./Size";
import HttpError from "../state/HttpError";
import { SceneUploadResult, Uploader, UploadOperation } from "../state/uploader";




@customElement("upload-manager")
export default class UploadManager extends LitElement{
  //static shadowRootOptions = {...LitElement.shadowRootOptions, delegatesFocus: true};
  private uploader = new Uploader(this);
  @state()
  busy: boolean = false;

  @state()
  error:string|null = null;

  @state()
  scenes

  connectedCallback(): void {
    super.connectedCallback();
    // We register a number of global events that might influence app behaviour
    window.addEventListener("drop", this.handleGlobalDrop);
    window.addEventListener("dragover", this.handleGlobalDragover);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("drop", this.handleGlobalDrop);
    window.removeEventListener("dragover", this.handleGlobalDragover);
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



  handleSubmit = (ev:MouseEvent)=>{
    ev.preventDefault();
    ev.stopPropagation();
    const form = this.uploadForm;
    const data= new FormData(form);
    if(!form.checkValidity()){
      Notification.show("Upload form is invalid", "warning", 1500);
      return;
    }
    const tasks = this.uploader.uploads.map(u=>u.task_id)
    console.log("Submit, form :", data, tasks);
    this.busy = true;
    this.error = null;
    fetch("/tasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        type: "createSceneFromFiles",
        data: {
          tasks,
          name: data.get("name"),
          language: data.get("language")?.toString().toUpperCase(),
          options: {
            optimize: data.get("optimize") ?? false
          }
        }
      })
    }).then(async (res)=>{
      await HttpError.okOrThrow(res);
      let task = await res.json();
      console.log("Body : ", task);
      if(!task.task_id) throw new Error(`Unexpected body shape: ${JSON.stringify(task)}`);
      const u = new URL(window.location.href);
      u.searchParams.append("task", task.task_id);
      window.location.href = u.toString();
    }).catch((e)=>{
      console.error(e);
      this.error = e.message;
    }).finally(()=> this.busy = false);
    //Reset everything
    return false;
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
    this.uploader.handleFiles(ev.dataTransfer.files);
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
    this.uploader.handleFiles((ev.target as HTMLInputElement).files);
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
    const models = this.uploader.uploads.filter(u=>u.filetype === "model" || u.filetype === "source");
    const defaultTitle = models[0]?.filename.split(".").slice(0, -1).join(".") ?? "";

    if(this._defaultTitle != defaultTitle && !this.uploader.has_pending_uploads){
      console.log("Assign default title %s to ", defaultTitle, ["", defaultTitle].indexOf(this.nameInput.value) != -1, this.nameInput)
      if(this.nameInput){
        if(["", this._defaultTitle].indexOf(this.nameInput.value) != -1) this.nameInput.value = defaultTitle;
        this._defaultTitle  = defaultTitle
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
        this.uploader.remove(u.id);
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
      <span class="upload-filetype filetype-${u.filetype?.[0]}">${u.filetype?.[0].toUpperCase() ?? ""}</span>
      <span class="upload-filename">
        ${u.filename}
      </span>
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
    const has_model = this.uploader.uploads.findIndex(u=>u.filetype === "model" || u.filetype === "source") !== -1
    return html`<slot name="upload-form" ?disabled=${this.uploader.has_pending_uploads|| this.busy}></slot>
      <div class="submit-container" style="display:flex; justify-content: end; align-items: center; gap: 1rem;">
        <div style="color:var(--color-error);">${this.error}</div>
        ${(()=>{
          if(this.uploader.has_pending_uploads|| this.busy) return html`<span class="loader" style="width: 34px; height: 34px; --color-loader: var(--color-secondary);"></span>`
          else if(this.uploader.has_errors) return html`<slot name="upload-errors">Some uploads have failed</slot>`
          else if(this.uploader.size && has_model) return html`<slot name="submit" @click=${this.handleSubmit} ?disabled=${this.uploader.has_pending_uploads}><button>Submit</button></slot>`
          else if(this.uploader.size) return html`<slot name="no-model">Provide at least one model</slot>`
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
        ${this.uploader.uploads.map(u=>(u.scenes?.map(s=>html`<li><span class="scene-action scene-action-${s.action}">[${s.action.toUpperCase()}]</span> ${s.name}</li>`)) ?? [])}
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
    const uploads = this.uploader.uploads;
    const is_active = uploads.some(u=>!u.done && !u.error );
    const scene_archives = uploads.filter(u=>u.filetype === "archive");
    let form_content :TemplateResult|null = null;
    if(scene_archives.length && scene_archives.length == uploads.length){
      form_content = this.renderScenesContentSummary();
    }else if(scene_archives.length){
      form_content = this.renderMixedContentWarning();
    }else if(uploads.length){
      form_content = this.renderSceneCreationForm();
    }else{
      form_content = html`<slot name="upload-lead">Start uploading files in the box above.</slot>`
    }
    return html`
      <slot name="title"  id="upload-form-title">Create or Update a scene</slot>
      <div id="drop-zone" class="dropzone  ${is_active?" active":""}${uploads.length?"":" empty"}">
        <ul class="upload-list">
          ${uploads.map(this.renderUploadItem)}
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

        .upload-filetype{
          font-family: monospace;
          font-weight: bold;
          align-self: center;
          &:not(:empty)::before{
            content: "[";
          }
          &:not(:empty)::after{
            content: "]";
          }
          &.filetype-u{
            color: var(--color-info);
          }
          &.filetype-s{
            color: var(--color-warning);
          }
          &.filetype-m{
            color: var(--color-success);
          }
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
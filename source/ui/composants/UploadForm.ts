import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";

import Notification from "./Notification";

import styles from '!lit-css-loader?{"specifier":"lit"}!sass-loader!../styles/common.scss';
import i18n from "../state/translate";

interface UploadOperation{
  //Unique ID of the upload. Might be different from "name" when we upload a scene zip
  id: string;
  filename: string;
  //An array to be able to show a list of imported scenes in case of zip uploads
  scenes: { name: string, status?: "ok" | "fail", error?: string }[];
  error ?:{code?:number, message:string};
  done :boolean;
  total ?:number;
  progress :number;
  abort :()=>void;
}

@customElement("upload-form")
export default class UploadForm extends i18n(LitElement){
  static shadowRootOptions = {...LitElement.shadowRootOptions, delegatesFocus: true};

  /**
   * List of upload operations
   * We use an array instead of a Map or Set because we expect this list to stay stable through updates
   */
  @state()
  uploads :UploadOperation[] = [];


  /**
   * Remove a download operation
   * @param name scene name that uniquely identifies the operation
   */
  splice(id: string):void;
  splice(id: string, obj :Partial<UploadOperation>):void
  /**
   * Amend a running download operation
   * @param name scene name that uniquely identifies the operation
   * @param changes partial object to merge into operation
   */
  splice(id: string, changes?: Partial<UploadOperation>) {
    this.uploads = this.uploads.map(current => {
      if (current.id !== id) return current;
      else if (changes && current) return { ...current, ...changes };
      else return undefined;
    }).filter(u=>!!u);
  }

  /**
   * @returns True if the file upload started. False otherwise
   */
  upload(file: File, {language, name, optimize}: {language?:string, name?: string, optimize?:boolean}) :boolean{

    const as_scenes = file.name.endsWith(".zip");

    name = name || file.name.split(".").slice(0,-1).join(".");
    const id = as_scenes? `${file.name}.${Date.now().toString(36).slice(-4)}`:name;
    const match = this.uploads.find(u=>u.id === id)
    if(match && !match.error && ! match.done){
        Notification.show(`Can't create ${name}: already uploading`, "error", 4000);
        return false;
    }else if (match){
      this.splice(match.id);
    }

    if(!file){
      Notification.show(`Can't upload : No file provided`, "error", 4000);
      return false;
    }


    let xhr = new XMLHttpRequest();



    const setError = ({code, message}:{code?:number, message:string})=>{
        Notification.show(`Can't  create ${name}: ${message}`, "error", 8000);
        this.splice(id, {error: {code, message}});
    }

  

    //Create the download operation
    this.uploads = [ ...this.uploads, {
      id,
      filename: file.name,
      scenes:[{name}],
      progress:0,
      done: false,
      abort: ()=>{
        xhr.abort();
        this.splice(name, {error: {message: "Upload was aborted"}});
      }
    }];


    xhr.onload = ()=>{
      if (299 < xhr.status) {
        const fail_response = JSON.parse(xhr.responseText) as { message?: string, failed_scenes?: { [id: string]: string } };
        if (fail_response.failed_scenes) {
          const failedScenes: { name: string; status?: "ok" | "fail"; error?: string }[] = Array.from(new Set(Object.keys(fail_response.failed_scenes).map(name => name.split("/")[0]))).map((name) => { return { name: name, status: "fail", error: fail_response.failed_scenes[name] } });
          this.splice(id, { done: true, scenes: failedScenes });
        }
        return setError({ code: xhr.status, message: fail_response.message ? fail_response.message : xhr.statusText });
      }

      if (as_scenes) {
        try {
          let response = JSON.parse(xhr.responseText) as { ok: string[]};
          let scenes: { name: string; status?: "ok" | "fail"; }[] = Array.from(new Set(response.ok.map(name => name.split("/")[0]))).map((name) => { return { name: name, status: "ok" } });
          this.splice(id, {done: true, scenes: scenes });
        } catch(e){
          console.log("error", e);
          setError({ message: e.message})
        }
      }else{
        this.splice(id, {done: true});
      }
    }

    xhr.upload.onprogress = (evt)=>{
        if(evt.lengthComputable){
          this.splice(id, {progress: Math.floor(evt.loaded/evt.total*100), total: evt.total});
        }else{
          this.splice(id, {progress: 0, total: 0});
        }
    }

    xhr.onerror = function onUploadError(ev){
      console.log("XHR Error", ev);
      setError({ code: xhr.status, message: xhr.response.message ? xhr.response.message : xhr.statusText });
    }

    let url = new URL(as_scenes? `/scenes`:`/scenes/${name}`, window.location.href);
    if(typeof language === "string" && language){
      url.searchParams.set("language", language);
    }
    if(optimize){
      url.searchParams.set("optimize", "true");
    }

    xhr.open('POST', url);
    xhr.send(file);
  }

  handleSubmit = (ev:SubmitEvent)=>{
    ev.preventDefault();
    ev.stopPropagation();
    const data = new FormData(ev.target as HTMLFormElement);

    const files =  data.getAll("files").map((fileData) => {return fileData as File});
    files.forEach((file) => this.upload(file, {
      language: data.get("language") as string,
      name: files.length==1? data.get("name") as string: "",
      optimize: !!data.get("optimize")
    }));
    (ev.target as HTMLFormElement).reset();
    return false;
  }

  protected renderSceneBox(id, name, status, error?:string) {
    return status=="ok" ? html`
        <a href="/ui/scenes/${encodeURI(name)}" class="card-header">
         <ui-icon name="list"></ui-icon><span> ${name}</span>
        </a>
        <a class="tool-link" href="/ui/scenes/${name}/view" >
        <ui-icon name="eye"></ui-icon>
        <span class="tool-text">${this.t("ui.view",{capitalize: "string"})}</span>
                <a class="tool-link" href="/ui/scenes/${name}/edit">
        <ui-icon name="edit"></ui-icon>
          <span class="tool-text">${this.t("ui.edit",{capitalize: "string"})}</span>
        </a>
      </a>` :
      html`<span class="text-error error-message progress">
      ${name} failed. ${error ? error : ""}
      </span>`;
  }


  protected render(): unknown {
    return html`      <slot @submit=${this.handleSubmit}></slot>
    
    ${this.uploads.length? html`
      <section class="container upload-status-container" aria-label="uploads">
        ${this.uploads.map( ({id, filename, scenes, progress, total, done, abort, error}) => {
          const handleAbort = ()=>{
            if(!done && !error) abort();
            else this.splice(id);
          }
          let content = html`<div role="status" id="upload-${id}" class="upload-status">
          <progress id="progress-${filename}" max="100" value=${progress}></progress>`
      if (error) {
        if (scenes.length > 0) {
          content = html`<span id='progress-${filename}' class='text-error progress'>${scenes.map((scene) => scene.name).join(',')}: ${error.message}</span>
          <div class="scenes-container">${scenes.map(scene => this.renderSceneBox(id, scene.name, scene.status || (error ? "fail" : "ok"), scene.error))}
            </div>`
        } else {
          content = html`<span id="progress-${filename}" class="text-error progress">${scenes.map((scene) => scene.name).join(',')}: ${error.message}</span>`;
        }
      }else if(done){
        content = 
          html`<div class="scenes-container">${scenes.map(scene => this.renderSceneBox(id, scene.name, scene.status || (error ? "fail" : "ok"), scene.error))}
            </div>`
      }

          return html`<div class="filename"><label for="progress-${filename}">${filename}</label></div>
            <div><span> ${total?html`(<b-size b=${total}></b-size>)`:null}</span></div>
            <div role="status" id="upload-${id}" class="upload-status">
            ${content}
            </div>
            <button class="btn btn-transparent btn-inline btn-small text-error" @click=${handleAbort}>🗙</button>`; 

    })}
      </section>`: null}
    `;
  }

  static styles = [styles, css`
    .upload-status-container{
      display: grid;
      grid-template-columns: 1fr max-content 1fr max-content;
      gap: 1em;
      align-items: center;
    }
    .container .filename {
      word-breaK:break-all;
    }

    .scenes-container{
      display: grid;
      grid-template-columns: 1fr max-content max-content;
      gap: 0.5em;
    }

    .upload-status{
      padding: .2rem;
    }

    .error-message{
      grid-column: 1 / 4;
    }
    
    progress, .progress{
      flex: 1 1 auto;
      width: 100%;
    }

    progress, 
    
    .scenes-container a {
      /*padding: 0.75em;*/
    	align-content: flex-start;
	    display: flex;
      font-weight: bolder;
    }

    .scenes-container a:hover{
      color: var(--color-secondary-light);
    }

    .ui-icon {
      fill: currentColor;
    	flex: 0 0 auto;
    	display: inline-block;
    	height: 1rem;
    	width: 1rem;
    	height: 1lh;
	    width: 1lh;
      margin-right: 0.3em;
    }
  `];
}
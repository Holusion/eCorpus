import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";

import Notification from "./Notification";

import styles from '!lit-css-loader?{"specifier":"lit"}!sass-loader!../styles/common.scss';

interface UploadOperation{
  //Unique ID of the upload. Might be different from "name" when we upload a scene zip
  id: string;
  //An array to be able to show a list of imported scenes in case of zip uploads
  names: string[];
  error ?:{code?:number, message:string};
  done :boolean;
  total ?:number;
  progress :number;
  abort :()=>void;
}

@customElement("upload-form")
export default class UploadForm extends LitElement{
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
  splice(id: string, changes ?:Partial<UploadOperation>){
    this.uploads = this.uploads.map(current =>{
      if(current.id !== id) return current;
      else if (changes && current) return {...current, ...changes};
      else return undefined;
    }).filter(u=>!!u);
  }

  /**
   * @returns True if the file upload started. False otherwise
   */
  upload(data :FormData) :boolean{
    const file = data.get("files") as File;
    let name = data.get("name") as string;
    let language = data.get("language");

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
      names:[name],
      progress:0,
      done: false,
      abort: ()=>{
        xhr.abort();
        this.splice(name, {error: {message: "Upload was aborted"}});
      }
    }];


    xhr.onload = ()=>{
      if(299 < xhr.status) return setError({code: xhr.status, message: xhr.statusText});
      console.log("DONE");
      if(as_scenes){
        try{
          let response = JSON.parse(xhr.responseText) as {ok:string[], fail:[]};
          let scenes = Array.from(new Set(response.ok.map(name=>name.split("/")[0])));
          this.splice(id, {done: true, names: scenes});
        }catch(e){
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
        setError({code: xhr.status, message: xhr.statusText});
    }

    xhr.open('POST', as_scenes? `/scenes`:`/scenes/${name}?language=${language}`);
    xhr.send(file);
  }

  handleSubmit = (ev:SubmitEvent)=>{
    ev.preventDefault();
    ev.stopPropagation();
    const data = new FormData(ev.target as HTMLFormElement);

    this.upload(data);
    (ev.target as HTMLFormElement).reset();
    return false;
  }

  protected render(): unknown {
    return html`${this.uploads.length? html`
      <section class="container upload-status-container" aria-label="uploads">
        ${this.uploads.map( ({id, names, progress, total, done, abort, error}) => {
          let name = names.join(", ");
          console.log("Render upload : ", id, names, error, done);
          let content = html`<progress id="progress-${name}" max="100" value=${progress}></progress>`;
          if(error){
            content = html`<span id="progress-${name}" class="text-error progress">${error.message}</span>`;
          }else if(done){
            content = html`<span id="progress-${name}" class="progress">
              <ul>
              ${names.map(name=>html`<li><a href="/ui/scenes/${encodeURIComponent(name)}">${name} <ui-icon name="eye"></ui-icon></a></li>`)}
              </ul>
            </span>`;
          }

          const handleAbort = ()=>{
            if(!done && !error) abort();
            else this.splice(id);
          }

          return html`<div role="status" id="upload-${id}" class="upload-status">
            <label class="file-uploaded" for="progress-${name}">${name}</label>
            <span> ${total?html`(<b-size b=${total}></b-size>)`:null}</span>
            ${content}
            <button class="btn btn-transparent btn-inline btn-small text-error" @click=${handleAbort}>🗙</button>
          </div>`
        })}
      </section>`: null}
      <slot @submit=${this.handleSubmit}></slot>
    `;
  }

  static styles = [styles, css`
    .upload-status-container{
      display: flex;
      flex-direction: column;
      gap: .5rem;
    }

    .file-uploaded{
      width: 40%
    }

    .upload-status-container ul{
      margin: 0;
    }
    
    .upload-status-container .ui-icon {
      display: inline-block;
      margin: 0;
      width: 1rem;
      fill:currentColor

    }
      
    .upload-status{
      display:flex;
      gap: 1rem;
      background: var(--color-element);
      padding: .2rem;

    }
    
    progress, .progress{
      flex: 1 1 auto;
    }
  `];
}
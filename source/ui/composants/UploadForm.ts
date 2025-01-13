import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";

import Notification from "./Notification";

import styles from '!lit-css-loader?{"specifier":"lit"}!sass-loader!../styles/common.scss';



@customElement("upload-form")
export default class UploadForm extends LitElement{
  static shadowRootOptions = {...LitElement.shadowRootOptions, delegatesFocus: true};

  @state()
  uploads :{[name :string]:{
      error ?:{code?:number,message:string},
      done :boolean,
      total ?:number,
      progress ?:number,
      abort :()=>void
  }} = {};


  /**
   * @returns True if the file upload started. False otherwise
   */
  upload(data :FormData) :boolean{
    const file = data.get("files") as File;
    let name = data.get("name") as string;
    const as_scenes = file.name.endsWith(".zip");
    name = name || file.name.split(".").slice(0,-1).join(".");
    if(name in this.uploads){
        Notification.show(`Can't create ${name}: already uploading`, "error", 4000);
        return false;
    }

    if(!file){
      Notification.show(`Can't upload : No file provided`, "error", 4000);
      return false;
    }

    const setError = ({code, message})=>{
        Notification.show(`Can't  create ${name}: ${message}`, "error", 8000);
        delete this.uploads[name];
        this.uploads = {...this.uploads};
    }

    const setDone = ()=>{
      delete this.uploads[name];
      this.uploads = {...this.uploads};
    }


    let xhr = new XMLHttpRequest();
    this.uploads = {
      ...this.uploads,
      [name]: {progress:0, done: false, abort: ()=>{
        xhr.abort();
        setDone();
      }}
    };

    xhr.onload = ()=>{
        if(299 < xhr.status){
            setError({code: xhr.status, message: xhr.statusText});
        }else{
            Notification.show(name+" uploaded", "info");
            setTimeout(setDone, 0);
        }
    }

    xhr.upload.onprogress = (evt)=>{
        if(evt.lengthComputable){
          this.uploads = {...this.uploads, [name]: {...this.uploads[name], progress: Math.floor(evt.loaded/evt.total*100), total: evt.total}};
        }else{
          this.uploads = {...this.uploads, [name]: {...this.uploads[name], progress: 0, total: 0}};
        }
    }

    xhr.onerror = function onUploadError(ev){
      console.log("XHR Error", ev);
        setError({code: xhr.status, message: xhr.statusText});
    }

    xhr.open('POST', as_scenes? `/scenes`:`/scenes/${name}`);
    xhr.send(data);
  }

  onsubmit = (ev:SubmitEvent)=>{
    ev.preventDefault();
    ev.stopPropagation();
    const data = new FormData(ev.target as HTMLFormElement);

    this.upload(data);
    (ev.target as HTMLFormElement).reset();
  }

  protected render(): unknown {
    const uploads = Object.entries(this.uploads);
    return html`${uploads.length? html`
      <section class="container">
        ${uploads.map(([name, status])=>{
          let content = html`<progress max="100" value=${status.progress}></progress>`;
          if(status.error){
            content = html`<span class="text-error">${status.error.message}</span>`;
          }else if(status.done){
            content = html`<span class="text-success">OK</span>`;
          }
          return html`<div class="upload-status">
            <label for="progressbar">${name} ${status.total?html`(<b-size b=${status.total}></b-size>)`:null}</label>
            ${content}
            <button class="btn btn-transparent btn-inline btn-small text-error" @click=${status.abort}>🗙</button>
          </div>`
        })}
      </section>`: null}
      <slot @submit=${this.onsubmit}></slot>
    `;
  }

  static styles = [styles, css`
    .upload-status{
      display:flex;
      justify-content:space-between;
      gap: 1rem;
    }
    
    progress{
      flex: 1 1 auto;
    }
  `];
}
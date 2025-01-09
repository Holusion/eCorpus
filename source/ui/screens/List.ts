import { LitElement, TemplateResult, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import Notification from "../composants/Notification";

import "../composants/Spinner";
import "../composants/UploadButton";
import "./LandingPage";
import "../composants/SceneCard";
import "../composants/ListItem";
import "../composants/TagList";

import spinnerImage from "../assets/images/spinner.svg";

import i18n from "../state/translate";
import { UserSession, withUser } from "../state/auth";
import {repeat} from 'lit/directives/repeat.js';

import "../composants/TaskButton";
import { withScenes, Scene, sorts, OrderBy } from "../state/withScenes";
import { navigate } from "../state/router";

interface Upload{
    name :string;
}


/**
 * Main UI view for the Voyager Explorer application.
 */
 @customElement("corpus-list")
 export default class List extends withScenes( withUser( i18n( LitElement )))
 {

    @property({attribute:true, type: String})
    search ?:string;

    @property({type: Object})
    uploads :{[name :string]:{
        error ?:{code?:number,message:string},
        done :boolean,
        progress ?:number,
    }} = {};

    @property()
    dragover = false;

    @property({type: Array, attribute: false})
    selection = [];


    get isUser(){
        return (this.user && !this.user.isDefaultUser);
    }

    constructor()
    {
        super();
    }

    createRenderRoot() {
        return this;
    }
      
    public onLoginChange (u: UserSession|undefined){
        super.onLoginChange(u);
        this.fetchScenes();
    }

    upload(file :File, as_scenes = false){
        console.log("Upload File : ", file);
        let name = file.name.split(".").slice(0,-1).join(".");
        if(name in this.uploads){
            Notification.show(`Can't create ${name}: already uploading`, "error", 4000);
            return;
        }
    
        const setError = ({code, message})=>{
            Notification.show(`Can't  create ${name}: ${message}`, "error", 8000);
            delete this.uploads[name];
            this.uploads = {...this.uploads};
        }
        const setProgress = (n)=>{
            this.uploads = {...this.uploads, [name]: {...this.uploads[name], progress: n}};
        }
        const setDone = ()=>{
            this.fetchScenes().then(()=>{
                delete this.uploads[name];
                this.uploads = {...this.uploads};                
            });
        }

        this.uploads = {...this.uploads, [name]: {progress:0, done: false}};
        this.orderBy = "mtime";
        (async ()=>{
            let xhr = new XMLHttpRequest();
            xhr.onload = function onUploadDone(){
                if(299 < xhr.status){
                    setError({code: xhr.status, message: xhr.statusText});
                }else{
                    Notification.show(name+" uploaded", "info");
                    setTimeout(setDone, 0);
                }
            }
    
            xhr.upload.onprogress = function onUploadProgress(evt){
                if(evt.lengthComputable){
                    console.log("Progress : ", Math.floor(evt.loaded/evt.total*100));
                    setProgress(Math.floor(evt.loaded/evt.total*100));
                }else{
                    setProgress(0);
                }
            }
            xhr.onerror = function onUploadError(){
                setError({code: xhr.status, message: xhr.statusText});
            }
    
            xhr.open('POST', as_scenes? `/scenes`:`/scenes/${name}`);
            xhr.send(file);
        })();
    }

    onSelectChange = (ev :Event)=>{
        let target = (ev.target as HTMLInputElement);
        let selected = target.checked;
        let name = target.name;
        this.selection = selected? [...this.selection, name] : this.selection.filter(n=>n !== name);
    }

    private renderScene(mode :string, scene:Scene|Upload){

        return html`<scene-card cardStyle="list" 
            .mode=${mode} 
            name=${scene.name} 
            .thumb=${(scene as Scene).thumb} 
            .time=${(scene as Scene).mtime}
            access=${(("access" in scene)?((this.user?.isAdministrator)?"admin":scene.access.user): "none")}
            .onChange=${this.onSelectChange}
        />`
    }

    protected render() :TemplateResult {
        console.log("Render :", window.location.href);
        if(!this.isUser){
            return html`<landing-page></landing-page>`;
        }
        let mode = (this.user?"write":"read");

        let listContent = html`
            ${(this.list?.length == 0 && Object.keys(this.uploads).length == 0)?
                html`<h4>No scenes available</h1>`:
                repeat([
                    ...Object.keys(this.uploads).map(name=>({
                        key: name,
                        name: `Uploading ${name}: ${this.uploads[name].progress}%`,
                        thumb: spinnerImage,
                    })),
                    ...(this.list ??[]),
                ],(i)=>(i as any).key ?? i.name , (scene)=>this.renderScene(mode, scene))
            }
        `;




        return html`
            <div class="main-grid">
                <div class="grid-header">
                    <div class="form-item" style="display:flex; margin-bottom:10px; flex-grow: 1">
                        <input class="search-box-input" type="search" id="model-search" placeholder=${this.t("ui.searchScene")} value=${this.match??""} @change=${this.onSearchChange}>
                        <button class="btn btn-addon btn-main" style="margin-top:0" type="submit"><ui-icon name="search"></ui-icon></button>
                    </div>
                    <div class="form-control" style="margin-left:auto; padding:10px">
                        <span>${this.t("ui.sortBy")}</span>
                        <span class="form-item"><select style="width:auto" @change=${this.onSelectOrder}>
                            ${sorts.map(a=>html`<option value="${a}">${this.t(`ui.${a}`)}</option>`)}
                        </select></span>
                    </div>
                </div>
                
                <div class="grid-toolbar">
                    <div class="list-tasks form-control">
                        <div class="section">
                            <h3 style="margin-top:0">${this.t("ui.newScene")}</h3>
                            <upload-button class="btn btn-main" style="padding:8px" @change=${this.onUploadBtnChange}>
                                ${this.t("ui.upload")}
                            </upload-button>
                            
                            <a class="btn btn-main" href="/ui/standalone/?lang=${this.language.toUpperCase()}">${this.t("info.useStandalone")}</a>
                        </div>

                        ${(this.selection.length)?html`
                        <div class="section">
                            <h4 style="margin-top:0">${this.t("ui.tools")}</h4>
                            <a class="btn btn-main btn-icon" download href="/scenes?${
                                this.selection.map(name=>`name=${encodeURIComponent(name)}`).join("&")
                                }&format=zip">
                                Download Zip
                            </a>
                        </div>`: null}
                    </div>
                </div>
                
                <div class="grid-content list-items section" style="width:100%">
                    ${this.error? html`<div class="error">
                        <h2 class="text-error">Error</h2>
                        <span class="text-center">${this.error}</span>
                        <div style="display:flex;justify-content:center">
                            <button class="btn btn-main" @click=${()=>this.fetchScenes()}>Retry</button>
                        </div>
                    </div>`:null}
                    ${listContent}
                    ${this.loading?html`<div style="margin-top:10vh"><spin-loader visible></spin-loader></div>`:null}
                    ${this.dragover ?html`<div class="drag-overlay">Drop item here</div>`:""}
                    ${(this.loading || this.error)?null: html`<div style="display:flex;justify-content:center;padding-top:1rem;">
                        <button class="btn btn-main" @click=${()=>this.fetchScenes(true)}>Load more</button>
                    </div>`}
                </div>


            </div>`;
    }

    ondragenter = (ev)=>{
        ev.preventDefault();
    }
    ondragleave = ()=>{
        this.dragover = false;
    }
    ondragover = (ev)=>{
        ev.preventDefault()
        if(this.isUser) this.dragover = true;
    }
    ondrop = (ev)=>{
        ev.preventDefault();
        if(!this.isUser) return;

        this.dragover = false;
        for(let item of [...ev.dataTransfer.items]){
            
            let file = item.getAsFile();
            if( !/\.glb$/i.test(file.name) || item.kind !== "file"){
                Notification.show(`${file.name} is not valid. This method only accepts .glb files` , "error", 4000);
                continue;
            };
            this.upload(file)
        }
    }

    onUploadBtnChange = (ev:CustomEvent<{files: FileList}>)=>{
        ev.preventDefault();
        for(let file of [...ev.detail.files]){
            let ext = file.name.split(".").pop().toLowerCase();
            if(ext == "zip"){
                this.upload(file, true);
            }else if(ext == "glb"){
                this.upload(file, false);
            }else{
                Notification.show(`${file.name} is not valid. This method only accepts .glb files` , "error", 4000);
                continue;
            };
        }
    }

    onSearchChange = (ev)=>{
        ev.preventDefault();
        navigate(this, null, {search: ev.target.value});
        console.log("list items find : ",this.list)
    }

    onSelectOrder = (ev)=>{
        console.log("Select order : ", ev.target.value);
        let value = ev.target.value;
        this.orderBy = value as OrderBy;
    }
 }
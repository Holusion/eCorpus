import { css, customElement, property, html, TemplateResult, LitElement } from "lit-element";
import Notification from "../composants/Notification";

import "../composants/Spinner";
import "../composants/UploadButton";
import "./LandingPage";
import "../composants/SceneCard";
import "../composants/ListItem";

import i18n from "../state/translate";
import { UserSession, withUser } from "../state/auth";
import { repeat } from "lit-html/directives/repeat";

import "../composants/TaskButton";
import { withScenes, Scene, AccessType } from "../state/withScenes";



interface Upload{
    name :string;
}

/**
 * Main UI view for the Voyager Explorer application.
 */
 @customElement("home-page")
 export default class HomePage extends withScenes( withUser( i18n( LitElement )))
 {

    @property({type: Object})
    uploads :{[name :string]:{
        error ?:{code?:number,message:string},
        done :boolean,
        progress ?:number,
    }} = {};

    @property()
    dragover = false;

    @property({type: Boolean})
    compact :boolean = false;

    @property({type: Array, attribute: false})
    selection = [];

    get isUser(){
        return (this.user && !this.user.isDefaultUser);
    }

    access = ["read", "write", "admin"] as AccessType[];

    constructor()
    {
        super();
        this.orderBy = "mtime";
        this.orderDirection = "desc";
    }

    createRenderRoot() {
        return this;
    }

    public onLoginChange (u: UserSession|undefined){
        super.onLoginChange(u);
        this.fetchScenes();
    }

    upload(file :File, as_scenes = false){
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
        return html`<scene-card 
            cardStyle="grid" 
            .mode=${mode} 
            name=${scene.name} 
            .thumb=${(scene as Scene).thumb} 
            .time=${(("mtime" in scene)?scene.mtime: false)}
            access=${(("access" in scene)?((this.user?.isAdministrator)?"admin":scene.access.user): "none")}
        />`;
    }

    private renderSceneCompact(scene:Scene){
        return html`
            <a class="list-item" name="${scene.name}" href="/ui/scenes/${scene.name}/">
                <span style="flex: 0 1 auto;overflow: hidden;text-overflow: ellipsis">${scene.name}</span>
                <span style="flex: 1 0 40%;overflow: hidden;text-align: right;text-overflow: ellipsis"; font-size:smaller">${new Date(scene.mtime).toLocaleString(this.language)}</span>
            </a>
        `;
    }

    protected render() :TemplateResult {
        if(!this.isUser){
            return html`<landing-page></landing-page>`;
        }
        let mode = (this.user?"write":"read")
        if(!this.list){
            return html`<div style="margin-top:10vh"><spin-loader visible></spin-loader></div>`;
        }
        //All scenes where I am mentioned as a user, with read|write|admin sorted by last modified
        let scenes = this.list.sort((a, b) => new Date(b.mtime).valueOf() - new Date(a.mtime).valueOf());
        // Scenes where I am admin (max 4 last modified)
        let myScenes = scenes.filter((s:Scene)=> s.access.user == "admin").slice(0, 4);
        //Scenes where I can at least write (max 4 last created) - skipped if it has the same members as myScenes
        let recentScenes = this.list.filter((s:Scene)=> (s.access.user == "admin" || s.access.user == "write")).sort((a, b) => new Date(b.ctime).valueOf() - new Date(a.ctime).valueOf()).slice(0, 4 - Math.min(Object.keys(this.uploads).length, 4));
        
        let uploads = Object.keys(this.uploads).map(name=>({name}));
        
        return html`
        <h2>${this.t("info.homeHeader")}</h2>
        <div class="main-grid">
            <div class="grid-header">

            </div>

            <div class="grid-toolbar">
                <div class="section">
                    <h4>Tools</h4>
                    <a class="btn btn-main" href="/ui/scenes/">${this.t("ui.searchScene")}</a>
                    <upload-button class="btn btn-main" @change=${this.onUploadBtnChange}>
                        ${this.t("ui.upload")}<spin-loader style="padding-left: 5px" .visible=${uploads.length != 0} inline></spin-loader>
                    </upload-button>
                    <a class="btn btn-main" href="/ui/standalone/?lang=${this.language.toUpperCase()}">${this.t("info.useStandalone")}</a>
                </div>
                <div class="section">
                    <h3>${this.t("ui.mtimeSection")}</h3>
                    <div class="list list-items flush" style="position:relative;">
                        <span class="list-header">
                            <span style="flex: 0 1 auto;overflow: hidden;text-overflow: ellipsis">${this.t("ui.name")}</span>
                            <span style="flex: 1 0 40%;overflow: hidden;text-align: right;text-overflow: ellipsis; font-size:smaller">${this.t("ui.mtime")}</span>
                        </span>
                        ${repeat([
                            ...scenes.slice(0, 8),
                        ],({name})=>name , (scene)=>this.renderSceneCompact(scene))}
                    </div>
                </div>

            </div>
            <div class="grid-content">
                <div class="section">
                    <h3>${this.t("ui.myScenes")}</h3>
                    ${uploads.length !== 0? html`<spin-loader visible></spin-loader>`: (myScenes.length > 0) ? 
                        html`
                            <div class="list-grid" style="position:relative; margin-top:20px">
                                ${myScenes.map((scene)=>this.renderScene(mode, scene))}
                            </div>
                    `: null}
                </div>
                ${(recentScenes.some(s=>myScenes.indexOf(s) == -1))? html`<div class="section">
                        <h3>${this.t("ui.ctimeSection")}</h3>
                        <div class="list-grid" style="position:relative;">
                        ${repeat([
                            ...recentScenes,
                        ],({name})=>name , (scene)=>this.renderScene(mode, scene))}
                        </div>
                    </div>`: null}

            </div>
        </div>
    `}
    
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

 }
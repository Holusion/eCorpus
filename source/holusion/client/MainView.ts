/**
 * 3D Foundation Project
 * Copyright 2021 Smithsonian Institution
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { LitElement, customElement, property, html, TemplateResult } from "lit-element";
import { MathUtils, Vector3 } from "three";

import Notification from "@ff/ui/Notification";

import ExplorerApplication from "client/applications/ExplorerApplication";
import CVDocumentProvider from "client/components/CVDocumentProvider";
import SceneView from "client/ui/SceneView";

//@ts-ignore
import styles from '!lit-css-loader?{"specifier":"lit-element"}!sass-loader!client/ui/explorer/styles.scss';
//@ts-ignore
import splitStyles from '!lit-css-loader?{"specifier":"lit-element"}!sass-loader!./styles.scss';


import "./SplitContentView";
import "./SplitUserInterface/SplitUserInterface";
import "./SplitUserInterface/SettingsView/index";
import  "./SplitOverlay";
import CVViewer from "client/components/CVViewer";
import {provideScenes, IDocumentParams} from "./SplitUserInterface/state/scenes";

import Keyboard from  "./Keyboard";

class HTTPError extends Error{
    constructor(public code:number, message :string){
        super(message);
    }
    static async fromResponse(res :Response){
        return new HTTPError(res.status, `[${res.status}]: ${await res.text()}`);
    }
}

export interface NavigationParams{
    document ?:string;
    auto ?:boolean;
    route ?:string;
    lookAt ?:string;
}

export type NavigationEvent = CustomEvent<NavigationParams>;


async function *animationLoop() :AsyncGenerator<DOMHighResTimeStamp>{
    while(true){
        yield await new Promise(resolve =>window.requestAnimationFrame(resolve));
    }
}


/**
 * Main UI view for the Voyager Explorer application.
 */
@customElement("voyager-explorer-split")
export default class MainView extends provideScenes(LitElement)
{
    application: ExplorerApplication = null;
    private _loop :AbortController;

    @property()
    public document :string;

    @property()
    public route :string;
    
    @property({type: Boolean})
    private auto :boolean;


    @property({attribute:false, type: Boolean})
    settingsOpen :boolean = false;


    protected get viewer() {
        return this.application.system.getComponent(CVViewer);
    }

    constructor(){
        super();
        let sp = new URLSearchParams(window.location.search);
        this.route ??= decodeURIComponent(sp.get("route") || "");
        this.document ??= decodeURIComponent(sp.get("document"));
        this.auto ??= !!sp.get("auto");
    }

    public connectedCallback()
    {
        super.connectedCallback();

        this.classList.add("split-mode");

        Notification.shadowRootNode = this.shadowRoot;

        let keyboard = Keyboard.register();
        keyboard.style.width = "50%";
         
        this.error = null;

        this.application = new ExplorerApplication(null, {
            root: null,
            document: "scene.svx.json",
            resourceRoot:"/", 
            lang: "FR", 
            bgColor: "#000000", 
            bgStyle: "solid",
            quality: "Highest",
        }, true);
        

        /* This is all a workaround for this issue:
         * https://github.com/Smithsonian/dpo-voyager/issues/185
         * and should be deleted once it's solved.
         */
        this.application.system.getMainComponent(CVDocumentProvider).on("active-component",(e)=>{
            if((e as any).next) return;
            let scene :SceneView = (this.shadowRoot.querySelector(".sv-content-view") as any)?.sceneView;
            if(!scene){
                Notification.show("Failed dispose renderer", "warning");
            }
            (scene as any).view.renderer.dispose();
        });
        this.updateScenes();
    }
    
    public disconnectedCallback()
    {
        this._loop?.abort();
        this.application.dispose();
        this.application = null;
        this.viewer.rootElement = null;
    }
    
    protected update(changedProperties: Map<string | number | symbol, unknown>): void {

        //Set this.document on the fly if scenes has changed and document is not valid
        if(changedProperties.has("scenes") && this.scenes.length && (!this.document || this.document == "null" || !this.scenes.find(({root})=>root == this.document))){
            this.document = this.scenes[0].root;
            console.log("Set Document :", this.document );
        }

        //Open settings if an error happened and we have no scenes
        if(changedProperties.has("error") && this.error && !this.scenes.length){
            this.settingsOpen = true;
            if("code" in this.error && this.error.code != 404) Notification.show("Failed to fetch scenes : "+this.error.message, "error", 3000);
        }


        //Notify if scenes has been refreshed
        if(changedProperties.has("scenes") && ! this.error){
            Notification.show("Scenes have been refreshed", "info", 1500);
        }

        //Hack to trigger application.reloadDocument when necessary
        if(!this.error && this.scenes.length && this.document &&   this.document != "null" && this.document !== this.application.props.root){
            console.log("reload document : ",this.application.props.root , this.document);
            this.application.props.root = this.document;
            this.application.reloadDocument();
            this.viewer.rootElement = this;
        }
        super.update(changedProperties);
    }

    protected render() {
        let ui :TemplateResult, settings :TemplateResult, view :TemplateResult;
        if(this.settingsOpen){
            settings = html`<settings-view @close=${()=> this.settingsOpen = false}.system=${this.application.system}></settings-view>`;
        }else{
            settings = html`<ff-button class="open-btn" style="position:absolute; right:10px; top:10px" @click=${()=> this.settingsOpen =!this.settingsOpen} icon="${(this.settingsOpen?"close":"cog")}"></ff-button>`;
        }

        if(this.error){
            ui = html`<div class="et-screen et-container-1">${settings}
                <h1 style="color:white">Error</h1>
                <p>${this.error.message}</p>
                <div id="${Notification.stackId}"></div>
            </div>`;
        }else if(!this.scenes.length || !this.document){
            ui = html`
                <h1 style="color:white">Loading...</h1>
                <div id="${Notification.stackId}"></div>
            `;
        }else{
            let system = this.application.system;
            console.log("Render with path :", this.document, this.auto);
            if(!this.route){
                ui = html`<split-object-menu .system=${system} .docs=${this.scenes} @select=${this.onNavigate}></split-object-menu> ${settings}`
            }else{
                ui = html`<split-user-interface @select=${this.onNavigate} .system=${system}></split-user-interface>`
            }
            view = html`
                <split-content-view class="" .system=${system}></split-content-view>
                <split-overlay .system=${system}></split-overlay>
            `;
        }

        view ??= html`<div style="padding-top:30vh; margin:auto;height:100%;overflow:hidden"><sv-logo style="transform: scale(4)"></sv-logo></div>`;

        return html`
        <div class="split-screen-touch">
            ${ui}
        </div>
        <div class="split-screen-view">
            ${view}
        </div>
        <div id="${Notification.stackId}"></div>`
    }

    onNavigate = (ev :NavigationEvent)=>{
        console.log("Navigate to :", ev.detail);
        ["route", "document", "auto"].forEach((key)=>{
            if(typeof ev.detail[key] !== "undefined") this[key] = ev.detail[key];
        })
        let url = new URL(window.location.href);
        if(this.route) url.searchParams.set("route", encodeURIComponent(this.route));
        if(this.document) url.searchParams.set("document", encodeURIComponent(this.document));
        if(this.auto) url.searchParams.set("auto", "true");
        window.history.pushState({},"", url);

        if(ev.detail.lookAt){
            let coords = ev.detail.lookAt.split(",").map(s=>parseFloat(s));
            this.lookAt(coords as any);
        }else if(this.auto){
            this.loop();
        }else{
            this._loop?.abort(); 
        }
    }

    /**
     * simple ease-in ease-out function for [0..1] interval
     */
    easeInOut(t:number):number{
        return t > 0.5 ? 4*Math.pow((t-1),3)+1 : 4*Math.pow(t,3);
    }

    lookAt([x,y,z]:[number, number, number]){
        this._loop?.abort(); //Intentionally Share the same abort as loop();
        let control = this._loop = new AbortController();

        //Calculate pitch
        let rotation = new Vector3(x,0,z);
        let targetYaw = -17;
        let targetPitch = rotation.angleTo(new Vector3(1,0,0))*MathUtils.RAD2DEG +90;
        if(rotation.z>0) targetPitch=-targetPitch;
        (async ()=>{
            let start_timestamp = performance.now();
            let [startYaw, startPitch] = this.application.getCameraOrbit(null);
            for await (let timestamp of animationLoop()){
                if(control.signal.aborted) {console.log("break lookAt");break;}
                let completion = (timestamp - start_timestamp)/750;
                if(1 < completion ) {console.log("end lookAt", completion);break;}
                //Simple lerp over 1.5s.
                let yaw = startYaw*this.easeInOut(1-completion) +targetYaw*this.easeInOut(completion);
                let pitch = startPitch*this.easeInOut(1-completion) + targetPitch*this.easeInOut(completion);
                this.application.setCameraOrbit(yaw as any, pitch as any);
            }
        })();
    }

    /**
     * Automatic camera orbit when on non-interactive pages
     */
    loop ({ timeout=1000, speed=0.01, target=undefined }={}) :void{
        this._loop?.abort();
        let control = this._loop = new AbortController();
        (async ()=>{
            let [yaw, pitch] = this.application.getCameraOrbit(null);
            let last_direction = 1;
            let last_timestamp = performance.now();
            let idle_since = last_timestamp;
            for await (let timestamp of animationLoop()){
                if(control.signal.aborted) {console.log("break loop");break;}
                let elapsed = (timestamp-last_timestamp);
                last_timestamp = timestamp;
                let [n_yaw, n_pitch] = this.application.getCameraOrbit(null);
                if( n_yaw != yaw || n_pitch != pitch ){
                    last_direction = Math.sign(n_pitch - pitch);
                    yaw = n_yaw;
                    pitch = n_pitch;
                    idle_since = timestamp;
                    continue;
                }
                if ( (idle_since + timeout) <= timestamp){
                    pitch = (((pitch) + last_direction*speed*elapsed) % 360);/* deg/s */
                    this.application.setCameraOrbit(yaw as any, pitch as any);
                }else{
                    //waiting to be idle for enough time
                }
            }
        })();
    }

    static styles = [styles, splitStyles];
}
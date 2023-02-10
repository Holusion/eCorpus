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

import Notification from "@ff/ui/Notification";

import ExplorerApplication from "client/applications/ExplorerApplication";
import "client/ui/explorer/ContentView";


//@ts-ignore
import styles from '!lit-css-loader?{"specifier":"lit-element"}!sass-loader!client/ui/explorer/styles.scss';
import CFullscreen from "@ff/scene/components/CFullscreen";
import CVARManager from "client/components/CVARManager";
import CVViewer from "client/components/CVViewer";




export interface NavigationParams{
    document ?:string;
    auto ?:boolean;
    route ?:string;
    lookAt ?:string;
}

export type NavigationEvent = CustomEvent<NavigationParams>;


/**
 * Main UI view for the Voyager Explorer application.
 */
@customElement("voyager-explorer-leak")
export default class MainView extends LitElement
{
    application: ExplorerApplication = null;
    @property()
    public document :string;

    private readonly documents :string[]= ["600_Suzanne", "Casque", "campus_Romainville_2"];

    constructor(){
        super();
        this.application = new ExplorerApplication(null, {
            root: `/scenes/${this.documents[0]}/`,
            document: "scene.svx.json",
            resourceRoot:"/", 
            lang: "FR", 
            bgColor: "#000000", 
            bgStyle: "solid"
        });
    }

    protected get fullscreen() {
        return this.application.system.getMainComponent(CFullscreen);
    }
    protected get arManager() {
        return this.application.system.getMainComponent(CVARManager);
    }
    protected get viewer() {
        return this.application.system.getComponent(CVViewer);
    }

    protected connected()
    {
        this.fullscreen.fullscreenElement = this;
        this.viewer.rootElement = this;
        this.arManager.shadowRoot = this.shadowRoot;
    }

    protected disconnected()
    {
        this.fullscreen.fullscreenElement = null;
        this.viewer.rootElement = null;
        this.application.dispose();
        this.application = null;
    }

    public connectedCallback()
    {
        super.connectedCallback();
        this.classList.add("split-mode");
        Notification.shadowRootNode = this.shadowRoot;
        let index = 0;
        setInterval(()=>{
          index = (index + 1) % this.documents.length;
          this.document =  `/scenes/${this.documents[index]}/`
        },5000);
        this.connected();
    }

    protected render() {
        let system = this.application.system;
        
        if(this.document && this.document !== this.application.props.root){
            console.log("reloadDocument : ",this.application.props.root , this.document);
            this.application.props.root = this.document;
            this.application.reloadDocument();
            this.connected();
        }
        return html`<div class="et-screen et-container-1">
            <sv-content-view .system=${system}></sv-content-view
        </div>
        <div id="${Notification.stackId}"></div>`
    }



    public disconnectedCallback()
    {
        this.application.dispose();
        this.application = null;
        this.disconnected();
    }

    static styles = [styles];
}
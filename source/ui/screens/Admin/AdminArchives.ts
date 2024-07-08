
import { customElement, property, html, TemplateResult, LitElement, css } from "lit-element";

import "../../composants/Spinner";
import Modal from "../../composants/Modal";
import "../../composants/SceneCard";
import HttpError from "../../state/HttpError";
import "../../composants/Icon";
import { nothing } from "lit-html";
import Notification from "../../composants/Notification";
import i18n from "../../state/translate";
import { Scene } from "../../state/withScenes";

import commonStyles from '!lit-css-loader?{"specifier":"lit-element"}!sass-loader!../../styles/common.scss';
import tableStyles from '!lit-css-loader?{"specifier":"lit-element"}!sass-loader!../../styles/tables.scss';

interface User {
    uid :string;
    username :string;
    isAdministrator :boolean;
}

/**
 * Main UI view for the Voyager Explorer application.
 */
 @customElement("admin-archives")
 export default class AdminArchivesScreen extends i18n(LitElement)
 {
    @property({type: Array})
    list : Scene[];

    @property({attribute: false, type: Boolean})
    loading =true;

    @property({attribute: false, type: Object})
    error :Error;

    constructor()
    {
        super();
    }
      
    public connectedCallback(): void {
        super.connectedCallback();
        this.fetchScenes();
    }
    
    fetchScenes() : void{
        this.loading = true;
        fetch("/scenes?access=none")
        .then(HttpError.okOrThrow)
        .then(async (r)=>{
            this.list = (await r.json()).scenes;
            console.log("List : ", this.list);
        }).catch((e)=>{
            console.error(e);
            this.error = e;
        })
        .finally(()=> this.loading = false);
    }

    onDeleteScene = (ev :MouseEvent, s :Scene)=>{
        ev.preventDefault();
        fetch(`/scenes/${s.name}?archive=false`, {
            headers: {"Content-Type": "application/json"},
            method: "DELETE"
        }).then(HttpError.okOrThrow)
        .then(()=>this.fetchScenes())
        .then(()=>Notification.show(`Scene ${s.name} Deleted`, "info"))
        .catch(e=>{
            console.error(e);
            Modal.show({
                header: "Error deleting Scene",
                body: "Message : "+e.message,
            });
        });
        Modal.close();
    }

    deleteSceneOpen(s:Scene){
        Modal.show({
            header: "Delete scene",
            body: html`<div>${this.t("info.sceneDeleteConfirm", {name : s.name})}</div>`,
            buttons: html`<div style="display:flex;padding-top:30px;">
                <ui-button class="btn-main" text="cancel" @click=${Modal.close}></ui-button>
                <ui-button class="btn-danger" text="delete" @click=${(ev)=>this.onDeleteScene(ev, s)}><ui-button>
            </div>`
        });
    }

    protected render() :TemplateResult {
        if(this.error){
            return html`<h2>Error</h2><div>${this.error.message}</div>`;
        }else if(this.loading){
            return html`<div style="margin-top:10vh"><spin-loader visible></spin-loader></div>`
        }
        return html`<div>
            <h1>${this.t("ui.archive", {plural:true})}</h2>
            <div class="users-list section" style="position:relative;">
                <table class="list-table">
                    <thead><tr>
                        <th>${this.t("ui.mtime")}</th>
                        <th>${this.t("ui.name")}</th>
                        <th>${this.t("ui.author")}</th>
                        <th></th>
                    </tr></thead>
                    <tbody>
                    ${(!this.list?.length)?html`<tr><td colspan=4 style="text-align: center;">Nothing was archived</td</tr>`:nothing}
                    ${this.list.map(s=>html`<tr>
                        <td>${new Date(s.mtime).toLocaleString(this.language)}</td>
                        <td>${s.name}</td>
                        <td>${s.author}</td>
                        <td>
                          <div style="display:flex; justify-content:end;gap:.6rem;">
                            <ui-button style="color:var(--color-error)" inline transparent icon="trash" title=${this.t("ui.delete")} @click=${()=>this.deleteSceneOpen(s)}></ui-button>
                          </div>
                        </td>
                    </tr>`)}
                    </tbody>
                </table>
            </div>
        </div>`;
    }
    static readonly styles = [commonStyles, tableStyles];
 }
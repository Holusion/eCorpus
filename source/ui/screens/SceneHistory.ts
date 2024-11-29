
import { css, customElement, property, html, TemplateResult, LitElement } from "lit-element";

import Notification from "../composants/Notification";
import "../composants/Button";
import "../composants/Spinner";
import "../composants/Size";
import "../composants/TagList";
import "../composants/HistoryAggregation";

import { nothing } from "lit-html";
import i18n from "../state/translate";
import { withUser } from "../state/auth";
import { navigate } from "../state/router";
import Modal from "../composants/Modal";
import { AccessType, AccessTypes, Scene } from "../state/withScenes";
import HttpError from "../state/HttpError";
import { HistoryEntry, HistoryEntryJSON } from "../composants/HistoryAggregation";




interface AccessRights{
  uid :number;
  username :string;
  access :AccessType;
}



/**
 * Main UI view for the Voyager Explorer application.
 */
 @customElement("scene-history")
 export default class SceneHistory extends withUser(i18n(LitElement))
 {
    /** urlencoded scene name */
    @property()
    name :string;

    

    @property({attribute: false, type: Object})
    scene: Scene = null;
    @property({attribute: false, type:Array})
    versions : HistoryEntry[];

    @property({attribute: false, type:Array})
    permissions :AccessRights[] =[];

    #c:AbortController = new AbortController();

    constructor()
    {
        super();
    }
    createRenderRoot() {
        return this;
    }
      
    public connectedCallback(): void {
        super.connectedCallback();
        this.fetchScene();
        this.fetchHistory();
        this.fetchPermissions();
    }


    public disconnectedCallback(): void {
      this.#c.abort();
    }
    
    async fetchScene(){
      const signal = this.#c.signal;
      await fetch(`/scenes/${encodeURIComponent(this.name)}`, {signal}).then(async (r)=>{
        if(!r.ok) throw new Error(`[${r.status}]: ${r.statusText}`);
        let body = await r.json();
        if(signal.aborted) return;
        this.scene = body as Scene;
      }).catch((e)=> {
        if(e.name == "AbortError") return;
        console.error(e);
        Notification.show(`Failed to fetch scene scene: ${e.message}`, "error");
      });
    }

    async fetchPermissions(){
      const signal = this.#c.signal;
      await fetch(`/auth/access/${encodeURIComponent(this.name)}`, {signal}).then(async (r)=>{
        if(!r.ok) throw new Error(`[${r.status}]: ${r.statusText}`);
        let body = await r.json();
        if(signal.aborted) return;
        this.permissions = body as AccessRights[];
      }).catch((e)=> {
        if(e.name == "AbortError") return;
        console.error(e);
        Notification.show(`Failed to fetch scene history: ${e.message}`, "error");
      });
    }
    
    async fetchHistory(){
      const signal = this.#c.signal;
      await fetch(`/history/${encodeURIComponent(this.name)}?limit=100`, {signal}).then(async (r)=>{
        if(!r.ok) throw new Error(`[${r.status}]: ${r.statusText}`);
        let body = await r.json();
        if(signal.aborted) return;
        this.versions = (body as HistoryEntryJSON[]).map(e=>({...e, ctime:new Date(e.ctime)}));
      }).catch((e)=> {
        if(e.name == "AbortError") return;
        console.error(e);
        Notification.show(`Failed to fetch scene history: ${e.message}`, "error");
      });
    }

    can(a :AccessType) :boolean{
      return AccessTypes.indexOf(a ) <= AccessTypes.indexOf(this.scene.access.user) || this.user?.isAdministrator;
    }


    protected render() :TemplateResult {
        if(!this.versions || !this.scene){
          return html`<div style="margin-top:10vh"><spin-loader visible></spin-loader></div>`;
        }else if (this.versions.length == 0){
          return html`<div style="padding-bottom:100px;padding-top:20px;" >
              <h1></h1>
          </div>`;
        }

        let scene = encodeURIComponent(this.name);
        return html`<div>
          <h1 style="color:white">${this.name}</h1>

          <div id="scene-info" style="display:flex;flex-wrap:wrap;padding: 0 15px">

            <div id="scene-data-container" style="flex-grow: 1; min-width:300px;">
              <div id="scene-tags">
                ${this.renderTags()}
              </div>

              <div style="max-width: 300px">
                ${this.can("write")?html`<a class="btn btn-main" href=${`/ui/scenes/${scene}/edit`}>
                  <ui-icon name="edit"></ui-icon>  ${this.t("ui.editScene")}
                </a>`:null}
                <a class="btn btn-main" style="margin-top:10px" href=${`/ui/scenes/${scene}/view`}><ui-icon name="eye"></ui-icon>  ${this.t("ui.viewScene")}</a>
                <a class="btn btn-main" style="margin-top:10px" download href="/scenes/${scene}?format=zip"><ui-icon name="save"></ui-icon> ${this.t("ui.downloadScene")}</a>
              </div>
            </div>

            <div id="scene-permissions-container" style="min-width:300px;" class="section">
              ${this.renderPermissions()}
            </div>
            
          </div>
        </div>
        <div class="section">
          <h2>${this.t("ui.history")}</h2>
          <history-aggregation .entries=${this.versions} .scene=${scene} @restore=${this.onRestore}></history-aggregation>
        </div>
        ${this.can("admin")? html`<div style="padding: 10px 0;display:flex;color:red;justify-content:end;gap:10px">
        <div><ui-button class="btn-main" icon="edit" text=${this.t("ui.rename")} @click=${this.onRename}></ui-button></div>
        <div><ui-button class="btn-danger" icon="trash" text=${this.t("ui.delete")} @click=${this.onDelete}></ui-button></div>
        </div>`:null}
      </div>`;
    }


    async setTags(tags :string[]){
      return await fetch(`/scenes/${encodeURIComponent(this.name)}`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({tags})
      }).then(async r =>{
        await HttpError.okOrThrow(r);
        this.scene = await r.json();
      });
    }


    renderTags(){

      const addTag = (e:CustomEvent<string>)=>{
        const tag = e.detail.toLowerCase(); //Will get sanitized server-side but it won't hurt to fix it here
        const currentTags = new Set([...this.scene.tags]);
        console.log("Tags : ", tag, currentTags.has(tag), currentTags);
        if(currentTags.has(tag)){
          return Notification.show(`The scene already has a tag named ${tag}`, "warning", 4000);
        }
        currentTags.add(tag);
        this.scene = {...this.scene, tags: Array.from(currentTags)};
        this.setTags(this.scene.tags).catch(e=>{
          console.error(e);
          Notification.show(`Failed to add scene tag ${tag}: ${e.message}`, "error", 6000);
          const tags = new Set(this.scene.tags);
          tags.delete(tag);
          this.scene = {...this.scene, tags: Array.from(tags) };
        });
      }
      const rmTag = (e:CustomEvent<string>)=>{
        const tag = e.detail;
        const currentTags = new Set([...this.scene.tags]);
        currentTags.delete(tag);
        this.scene = {...this.scene, tags: Array.from(currentTags)};
        this.setTags(this.scene.tags).catch(e=>{
          console.error(e);
          Notification.show(`Failed to remove scene tag ${tag}: ${e.message}`, "error", 6000);
          const tags = new Set(this.scene.tags);
          tags.add(tag);
          this.scene = {...this.scene, tags: Array.from(tags) };
        });
      }
      return html`<tag-list .tags=${this.scene.tags} ?editable=${this.can("admin")} @add=${addTag} @remove=${rmTag}></tag-list>`
    }

    renderPermissions(){
      return html`
        <h2>${this.t("ui.access")}</h2>
          <table  class="list-table compact${!this.can("admin")?" disabled":""}">
            <thead><tr>
              <th>${this.t("ui.username")}</th>
              <th>${this.t("ui.rights")}</th>
            </tr></thead>
            <tbody>
            ${((!this.permissions?.length)?html`<tr>
              <td colspan=4 style="text-align: center;">
                ${this.t("info.noData",{item: this.name})}
              </td>
            </tr>`:nothing)}
            ${this.permissions.map((p, index) => {
              return html`<tr>
                <td title="${p.uid}">${p.username}</td>
                <td class="form-control">${this.renderPermissionSelection(p.username, p.access)}</td>
            </tr>`
            })}
              <tr>
                <td colspan=2 class="form-control" style="padding:0">
                  <form id="userlogin" style="padding:0" autocomplete="off" @submit=${this.onAddUserPermissions}>
                    <div class="form-group inline" style="padding:0;border:none;">
                      <div class="form-item" style="width:100%">
                        <input style="border:none;" type="text" name="username" id="username" placeholder="${this.t("ui.username")}" required>
                      </div>
                      <div class="form-item">
                        <input class="btn btn-main" style="border:none; margin:0" type="submit" value="${this.t("ui.add")}" >
                      </div>
                    </div>
                  </form>
                </td>
              </tr>
            </tbody>
          </table>
      `;
    }


    renderPermissionSelection(username:string, selected :AccessRights["access"], disabled :boolean = false){
      const onSelectPermission = (e:Event)=>{
        let target = (e.target as HTMLSelectElement)
        let value = target.value as AccessRights["access"];
        this.grant(username, value)
        .catch((e)=>{
          target.value = selected;
          Notification.show("Failed to grant permissions : "+e.message, "error");
        })
      }
      return html`<span class="form-item"><select .disabled=${disabled} @change=${onSelectPermission}>
        ${AccessTypes.map(a=>(a?html`<option .selected=${a === selected} value="${a}">${this.t(`ui.${a}`)}</option>`:null))}
      </select></span>`
    }

    onAddUserPermissions = (ev :SubmitEvent)=>{
      ev.preventDefault();
      let target = ev.target as HTMLFormElement;
      let username = target.username.value;
      this.grant(username, "read").catch(e=>{
        Notification.show(`Failed to grant read access for ${username}: ${e.message}`);
      })
    }

    onRestore = (e :CustomEvent<number>)=>{
      e.stopPropagation();
      const id = e.detail;
      let entry = this.versions.find(e=>e.id === id);
      if(!Number.isInteger(id) || !entry) return Notification.show(`Can't restore to ${id}: Invalid id`, "error");
      Notification.show(this.t("info.restoreTo", {point: `${entry.name}#${entry.generation}`}), "info", 1500);
      this.versions = null;
      fetch(`/history/${encodeURIComponent(this.name)}`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({id})
      }).then(async (r)=>{
        if(!r.ok) throw new Error(`Failed to restore [${r.status}]: ${await r.json()}`);
        Notification.show("Restoration completed.", "info", 3000)
      }).catch(e=>{
        Notification.show(`Failed to restore : ${e.message}`, 'error');
      }).finally(()=>this.fetchHistory())
    }

    async grant(username :string, access :AccessRights["access"]){
      if(access == "none" && username != "default") access = null;
      let p = fetch(`/auth/access/${encodeURIComponent(this.name)}`, {
        method: "PATCH",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({username:username, access:access})
      }).then(async (r)=>{
        if(!r.ok){
          try{
            let body = await r.json();
            throw new Error(`[${r.status}]: ${body.message || r.statusText}`);
          }catch(e){
            throw new Error(`[${r.status}] ${r.statusText}`);
          }
        }
      })
      p.then(()=>this.fetchPermissions()).catch(e=>{
        Notification.show(`Failed to fetch permissions : ${e.message}`);
      })
      return p;
    }

    onDelete = ()=>{
      const isArchived = this.scene.name.endsWith("#"+this.scene.id.toString(10));
      console.log("Scene: ", this.scene.name, this.scene.id);
      const doDelete = (archive:boolean)=>{
        Notification.show(`${archive?"Archiving":"Deleting"} scene ${this.name}`, "warning");
        fetch(`/scenes/${encodeURIComponent(this.name)}?archive=${archive?"true":"false"}`, {method:"DELETE"})
        .then(()=>{
          Modal.close();
          navigate(this, "/ui/");
        }, (e)=>{
          console.error(e);
          Notification.show(`Failed to remove ${this.name} : ${e.message}`);
        });
      }

      Modal.show({
        header: this.t("ui.delete", {capitalize: "string"}),
        body: html`<p>${ this.t("info.sceneDeleteConfirm", {name: this.name})}</p>`,
        buttons: html`<div style="display: flex;gap: 5px;justify-content: end;">
          ${isArchived? null: html`<ui-button class="btn-main" @click=${()=>doDelete(true)} text=${this.t("ui.archive")}></ui-button>`}
          ${this.user.isAdministrator?html`<ui-button class="btn-main btn-danger" @click=${()=>doDelete(false)} text=${this.t("ui.delete")}></ui-button>`:null}
        </div>`
      })
      
    }

    onRename = ()=>{
      const onRenameSubmit = (ev)=>{
        ev.preventDefault();
        let name = (Modal.Instance.shadowRoot.getElementById("sceneRenameInput") as HTMLInputElement).value;
        Modal.close();
        Modal.show({
          header: this.t("ui.renameScene"),
          body: html`<div style="display:block;position:relative;padding-top:110px"><spin-loader visible></spin-loader></div>`,
        });
        fetch(`/scenes/${encodeURIComponent(this.name)}`, {
          method:"PATCH",
          headers:{"Content-Type":"application/json"},
          body: JSON.stringify({name})
        }).then((r)=>{
          if(r.ok){
            Notification.show("Renamed "+this.name+" to "+name, "info", 1600);
            navigate(this, `/ui/scenes/${encodeURIComponent(name)}/`);
          }else{
            throw new Error(`[${r.status}] ${r.statusText}`);
          }
        }).catch((e)=>{
          console.error(e);
          Notification.show(`Failed to rename ${this.name} : ${e.message}`);
        }).finally(()=>{
          setTimeout(()=>{
            Modal.close();
          }, 500);
        });
      }

      Modal.show({
        header: this.t("ui.renameScene"),
        body: html`<form class="form-group" @submit=${onRenameSubmit}>
          <div class="form-item">
            <input type="text" required minlength=3 autocomplete="off" style="padding:.25rem;margin-bottom:.75rem;width:100%;" class="form-control" id="sceneRenameInput" placeholder="${this.name}">
          </div>
        </form>`,
        buttons: html`<ui-button class="btn-main" @click=${onRenameSubmit} text=${this.t("ui.rename")}></ui-button>`,
      });

    }
 }
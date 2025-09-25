import { LitElement, TemplateResult, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import Notification from "../composants/Notification";
import "../composants/Button";
import "../composants/Spinner";
import "../composants/Size";
import "../composants/TagList";
import "../composants/HistoryAggregation";

import i18n from "../state/translate";
import { withUser } from "../state/auth";
import { AccessType } from "../state/withScenes";
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
 export default class SceneHistory extends withUser(i18n(LitElement)) {
  /** urlencoded scene name */
  @property()
  name :string;

  @property({attribute: true, type: Boolean})
  write: boolean = false;

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
      this.fetchHistory();
  }


  public disconnectedCallback(): void {
    this.#c.abort();
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


  protected render() :TemplateResult {
      if(!this.versions){
        return html`<div style="margin-top:10vh"><spin-loader visible></spin-loader></div>`;
      }else if (this.versions.length == 0){
        return html`<div style="padding-bottom:100px;padding-top:20px;" >
            <h1></h1>
        </div>`;
      }
      return html`<history-aggregation .entries=${this.versions} .scene=${this.name} ?write=${this.write} @restore=${this.onRestore}></history-aggregation>`;
  }

  onRestore = (e :CustomEvent<number>)=>{
    e.stopPropagation();
    const id = e.detail;
    let entry = this.versions.find(e=>e.id === id);
    if(!Number.isInteger(id) || !entry) return Notification.show(`Can't restore to ${id}: Invalid id`, "error");
    if(!confirm(this.t("info.restoreTo", {point: `${entry.name}#${entry.generation}`}))){
      return;
    }
    const closeNotification = Notification.show(this.t("info.restoreTo", {point: `${entry.name}#${entry.generation}`}), "info", 1500);
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
    })
    .then(()=>this.fetchHistory())
    .then(()=>{
      closeNotification();
      Notification.show(this.t("info.restoredTo", {point: `${entry.name}#${entry.generation}`}), "info", 2500)
    });
  }
}
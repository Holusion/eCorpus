import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';



import i18n from "../../state/translate";

import Notification from "../../composants/Notification";
import "../../composants/Spinner";
import "../../composants/Button";

/**
 * Main UI view for the Voyager Explorer application.
 */
@customElement("admin-stats")
export default class AdminStatsScreen extends i18n(LitElement) {

  @property({attribute: false})
  stats :Record<string, Record<string, any>>;

  @property({attribute: false})
  scenes :{mtime:string, name:string}[] =[];

  fetchStats(){
    fetch("/admin/stats", {
      headers:{"Accept":"application/json"}
    }).then(async r=>{
      let b = await r.json();
      if(!r.ok) throw new Error(b.message);
      this.stats = b;
    }).catch(e=>{
      console.error(e);
      Notification.show(`Failed to fetch server stats : ${e.message}`, "error");
    });
  }

  fetchScenes(){
    fetch("/scenes", {
      headers:{"Accept":"application/json"}
    }).then(async r=>{
      let b = await r.json();
      if(!r.ok) throw new Error(b.message);
      let now = new Date();
      now.setHours(0,0,0,0);

      this.scenes = b.scenes.filter(scene=>{
        return now.valueOf() < new Date(scene.mtime).valueOf();
      });
    }).catch(e=>{
      console.error(e);
      Notification.show(`Failed to fetch server stats : ${e.message}`, "error");
    });
  }




  createRenderRoot() {
    return this;
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this.fetchStats();
    this.fetchScenes();
  }

  protected render(): unknown {
    if(!this.stats){
      return html`<div style="margin-top:10vh"><spin-loader visible></spin-loader></div>`
    }
    return html`<div style="max-width:1200px; margin: auto;">
      <h1>Server Statistics</h1>
      <div class="section">
        <h3>Files statistics</h3>
        <ul>
          <li>Total number of scenes: ${this.stats.files.scenes}</li>
          <li>Total number of files: ${this.stats.files.files}</li>
          <li>Last modification: ${new Date(this.stats.files.mtime).toLocaleString(this.language)}</li>
          <li>Total disk usage: <b-size i b=${this.stats.files.size}></b-size></li>
        </ul>      
      </div>
      <div class="section">
        <h3>Performance statistics</h3>
        <ul>
          <li>Free memory: <b-size b=${this.stats.process.freemem}></b-size></li>
          <li>Load average (1 min): ${Math.floor(100*this.stats.process.load[0] / this.stats.process.cores)}%</li>
          <li>Load average (15 min): ${Math.floor(100*this.stats.process.load[2] / this.stats.process.cores)}%</li>
        </ul>      
      </div>
      ${this.scenes?.length? html`
      <div class="section">
        <h2>Scenes modified today :</h2>
        <ul>
        ${this.scenes.map(scene=>html`<li><a href="/ui/scenes/${scene.name}/">${scene.name} (${new Date(scene.mtime).toLocaleString(this.language)})</a></li>`)}
        </ul>
      </div>`: null}
    </div>`;
  }
}
import { LitElement, property, customElement, html, TemplateResult } from "lit-element";
import Notification from "@ff/ui/Notification";


import "./LocalFilesList";
import "./RemoteScenesList";
import {provideBusy} from "../state/busy";
import { HTTPError } from "../state/errors";
import Keyboard from "../../Keyboard";


interface User {
  username :string;
  isDefaultUser:boolean;
  upstream :string;
}
interface Scene{
  name :string;
}


@customElement("settings-view")
export default class SettingsView extends provideBusy(LitElement) 
{
  #c = new AbortController();
  currentTab = 0;

  @property({attribute: false, type: Array})
  files : Array<string>;

  @property({attribute: false, type:Array})
  scenes :Array<Scene> = [];

  @property({type: Object })
  user :User|null|undefined;


  @property({type: Boolean, attribute: false})
  online :boolean;

  protected createRenderRoot(): Element | ShadowRoot {
    return this;
  }
  
  connectedCallback() {
    super.connectedCallback();
    this.classList.add("settings-view");

    this.updateOnlineStatus();
    this.getLoginState();
    this.addEventListener("click", this.onClose);
    window.addEventListener("online", this.updateOnlineStatus);
    window.addEventListener("offline", this.updateOnlineStatus);
  }

  disconnectedCallback(){
    super.disconnectedCallback();
    this.removeEventListener("click", this.onClose);
    window.removeEventListener("online", this.updateOnlineStatus);
    window.removeEventListener("offline", this.updateOnlineStatus);
  }

  getLoginState(){
    this.#c.abort();
    let c = this.#c = new AbortController();
    return this.run<User|null>(async ()=>{
      if(!this.online) return this.user = null;
      let r = await fetch("/login", {signal: c.signal});
      if(r.status !== 200 ) return this.user = null;
      return this.user = await r.json();
    });
  }

  protected render()
  {
    let tabs = []
    let isConnected = this.user && !this.user.isDefaultUser;
    let remoteScenes :TemplateResult;
    if(!this.online){
      remoteScenes = html`<div><p>Hors connexion</p></div>`;
    }else if(this.isBusy){
      remoteScenes = html`<div class="placeholder"></div>`
    }else if(!isConnected){
      remoteScenes = html`<div class="login-form">
        <h2>Me connecter</h2>
        <form id="userlogin" class="form-control form-modal" @submit=${this.onLoginSubmit}>
          <div class="form-group">
            <div class="form-item">
              <input @focus=${Keyboard.focus} type="text" autocomplete="upstream" name="upstream" id="upstream" placeholder="https://ecorpus.holusion.com" value="${this.user?.upstream ?? ""}" required>
              <label for="upstream">Serveur Distant</label>
            </div>
          </div>
          <div class="form-group">
            <div class="form-item">
              <input @focus=${Keyboard.focus} type="text" autocomplete="username" name="username" id="username" placeholder="username" required>
              <label for="username">Nom d'utilisateur</label>
            </div>
          </div>
          <div class="form-group">
            <div class="form-item">
              <input @focus=${Keyboard.focus} type="password" autocomplete="current-password" name="password" id="password" placeholder="mot de passe" required>
              <label for="password">Mot de passe</label>
            </div>
          </div>
          <div class="form-group">
            <div class="form-item">
              <input class="ff-button ff-control btn-primary" type="submit" value="Me connecter" >
            </div>
          </div>
        </form>
      </div>`
    }else{
      const remote = new URL(this.user.upstream ?? "https://ecorpus.holusion.com")
      remoteScenes = html`
        <div style="display:flex;justify-content:space-between;">
          <h2>Scenes téléchargeables</h2>
          <span style="padding:.25rem">Connecté à ${remote.hostname}</span>
        </div>
        <remote-scenes-list></remote-scenes-list>
      `;
    }

    let localFiles = html`<div class="files-list">
        <h2>Copier un fichier local</h2>
        <local-files-list class="list-items"></local-files-list>
      </div>`
    tabs = [remoteScenes, localFiles]

    return html`<div class="settings" @click=${(e)=>e.stopPropagation()}>
      <ff-button class="open-btn" style="position:absolute; right:0; top:0" @click=${this.onClose} icon="close"></ff-button>
      ${(this.isBusy?html`<div class="busy-overlay"><sv-spinner visible></sv-spinner></div>`:null)}
      <h1>Paramètres</h1>
      <div class="settings-nav">
        <ff-button class=${`ff-button ff-control ${this.currentTab == 0 ? "active btn-primary" : ""}`} text="scènes téléchargeables" @click=${()=>{this.currentTab = 0; this.requestUpdate()}}></ff-button>
        <ff-button class=${`ff-button ff-control ${this.currentTab == 1 ? "active btn-primary" : ""}`} text="fichiers locaux" @click=${()=>{this.currentTab = 1; this.requestUpdate()}}></ff-button>
      </div>
      <div class="tab-content">
        ${tabs[this.currentTab]}
      </div>
      <div style="padding-top: 3rem; display: flex; gap: 5px;">
      ${(isConnected? html`<ff-button class="btn-danger" text="Me déconnecter" @click=${this.onLogout}></ff-button>`: null)}
        <a class="ff-button ff-control" href="/">Recharger la page</a>
      </div>

    </div>`;
  }

  onClose = ()=>{
    if(!this.isBusy) this.dispatchEvent(new CustomEvent("close"));
  }

  onLoginSubmit = (ev :MouseEvent)=>{
    ev.preventDefault();
    let target = ev.target as HTMLFormElement;
    let username = target.username.value;
    let password = target.password.value;
    let upstream = target.upstream.value;
    console.log("Log in to %s with %s:%s", upstream, username, password);
    this.run(async ()=>{
      let u = new URL("/login", window.location.href);
      u.searchParams.set("username", username);
      u.searchParams.set("password", password);
      u.searchParams.set("upstream", upstream);
      let r = await fetch(u, {
        method: "POST",
        headers:{
          "Content-Type":"application/json",
          "Accept": "application/json",
        }
      })
      if(!r.ok) throw await HTTPError.fromResponse(r);
      let body = await r.json();
      this.user = body;
      console.log("Content : ", body);
    }).catch(e=>{
      console.error(e);
      Notification.show(`Failed to log in: ${e.message}`, "error");
    });
  }

  onLogout = ()=>{
    this.run(async ()=>{
      let r = await fetch("/logout", {method:"POST"});
      if(!r.ok) throw await HTTPError.fromResponse(r);
      this.user = {isDefaultUser:true, username:"default", upstream:this.user.upstream};
    }).catch(e=>{
      console.error(e);
      Notification.show(`Failed to log out: ${e.message}`, "error");
    })
  }

  updateOnlineStatus = ()=>{
    this.online = navigator.onLine;
  }
}
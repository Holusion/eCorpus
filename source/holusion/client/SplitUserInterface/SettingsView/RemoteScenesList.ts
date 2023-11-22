import { LitElement, property, customElement, html, TemplateResult } from "lit-element";
import Notification from "@ff/ui/Notification";
import Icon from "@ff/ui/Icon";
import { withBusy } from "../state/busy";
import { withScenes } from "../state/scenes";
import { HTTPError } from "../state/errors";
import "./RemoteSceneCard"

Icon.add("refresh", html`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M105.1 202.6c7.7-21.8 20.2-42.3 37.8-59.8c62.5-62.5 163.8-62.5 226.3 0L386.3 160H336c-17.7 0-32 14.3-32 32s14.3 32 32 32H463.5c0 0 0 0 0 0h.4c17.7 0 32-14.3 32-32V64c0-17.7-14.3-32-32-32s-32 14.3-32 32v51.2L414.4 97.6c-87.5-87.5-229.3-87.5-316.8 0C73.2 122 55.6 150.7 44.8 181.4c-5.9 16.7 2.9 34.9 19.5 40.8s34.9-2.9 40.8-19.5zM39 289.3c-5 1.5-9.8 4.2-13.7 8.2c-4 4-6.7 8.8-8.1 14c-.3 1.2-.6 2.5-.8 3.8c-.3 1.7-.4 3.4-.4 5.1V448c0 17.7 14.3 32 32 32s32-14.3 32-32V396.9l17.6 17.5 0 0c87.5 87.4 229.3 87.4 316.7 0c24.4-24.4 42.1-53.1 52.9-83.7c5.9-16.7-2.9-34.9-19.5-40.8s-34.9 2.9-40.8 19.5c-7.7 21.8-20.2 42.3-37.8 59.8c-62.5 62.5-163.8 62.5-226.3 0l-.1-.1L125.6 352H176c17.7 0 32-14.3 32-32s-14.3-32-32-32H48.4c-1.6 0-3.2 .1-4.8 .3s-3.1 .5-4.6 1z"/></svg>`);
Icon.add("download", html`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><path d="M216 236.07c0-6.63-5.37-12-12-12h-24c-6.63 0-12 5.37-12 12v84.01h-48.88c-10.71 0-16.05 12.97-8.45 20.52l72.31 71.77c4.99 4.95 13.04 4.95 18.03 0l72.31-71.77c7.6-7.54 2.26-20.52-8.45-20.52H216v-84.01zM369.83 97.98L285.94 14.1c-9-9-21.2-14.1-33.89-14.1H47.99C21.5.1 0 21.6 0 48.09v415.92C0 490.5 21.5 512 47.99 512h287.94c26.5 0 48.07-21.5 48.07-47.99V131.97c0-12.69-5.17-24.99-14.17-33.99zM255.95 51.99l76.09 76.08h-76.09V51.99zM336 464.01H47.99V48.09h159.97v103.98c0 13.3 10.7 23.99 24 23.99H336v287.95z"/></svg>`);

interface Scene {
  name: string;
  id: string;
  thumb: string;
  mtime: string;
  selected?: boolean;
}

@customElement("remote-scenes-list")
export default class RemoteScenesList extends withBusy(withScenes(LitElement))
{
  #c = new AbortController();

  @property({ attribute: false, type: Array })
  remoteScenes: Array<Scene> = [];

  @property({ attribute: false, type: Array })
  selection: Array<string> = [];

  @property({ type: Boolean, attribute: false })
  isLoading: boolean = false;


  protected createRenderRoot(): Element | ShadowRoot {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.classList.add("scenes-list");
    console.log("Connected");
    this.onFetchScenes();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  /**
   * All already present scenes are pre-selected unless otherwise specified
   */
  desiredScenes(): Scene[] {
    return this.remoteScenes.map(s => {
      return { ...s, selected: s.selected ?? (this.scenes.findIndex(doc => doc.name === s.name) !== -1) }
    })
  }
  protected render() {
    if (this.isLoading) {
      return html`<sv-spinner visible></sv-spinner>`;
    }
    let scenesList = this.desiredScenes();

    const allSelected = scenesList.every(s => s.selected);

    return html`
      <div style="display:flex; gap:5px; justify-content: end; margin-bottom:.5rem">
        <span style="margin-right:auto; align-self:center">${scenesList.length} scènes trouvées</span>
        ${scenesList.length ?html`<ff-button class="btn-primary" style="flex:0 0 auto" text=${allSelected ? "Déselectionner tout" : "Selectionner tout"} @click=${this.onSelectAll}></ff-button>`: null}
        <ff-button class="btn-primary" style="flex:0 0 auto" @click=${this.onFetchScenes} icon="refresh"></ff-button>
      </div>
      ${scenesList.length ? html`<div class="list">
        ${scenesList.map((s) => html`
          <remote-scene-card .selected=${s.selected} @click=${this.onSelect} id=${s.id} name=${s.name} thumb=${s.thumb} time=${s.mtime}></remote-scene-card>
        `)}
      </div>
      <div style="margin-top:.5rem" >
        <ff-button class="btn-primary" icon="download" text="update selected scenes" @click=${this.onDownloadScenes}></ff-button>
      </div>
      `: html`<span>
        Aucune scène. Rafraichissez la liste.
      </span>`}
    `;
  }

  onSelect = (ev) => {
    ev.stopPropagation();
    let id = ev.target.id;
    this.remoteScenes = this.desiredScenes().map(({selected}, index)=> {
      let s = this.remoteScenes[index];
      if (s.id === id){
        console.log(s)
        return { ...s, selected: !selected };
      }
      return s;
    });
  }

  onSelectAll = (ev) => {
    ev.stopPropagation();
    let state = this.remoteScenes.every(s => s.selected);
    this.remoteScenes = this.remoteScenes.map(s => ({ ...s, selected: !state }));
  }

  onFetchScenes = () => {
    this.#c.abort();
    let c = this.#c = new AbortController();
    this.isLoading = true;
    (async () => {
      try {
        let r = await fetch("/files/fetch", { signal: c.signal });
        if (!r.ok) throw new Error(`[${r.status}] ${await r.text()}`);
        let scenes = await r.json();
        this.remoteScenes = scenes.map(s => ({
          ...s, 
          id: s.id.toString(10),
          thumb: s.thumb?`/remote${new URL(s.thumb).pathname}`:"",
        }));
      } catch (e) {
        console.error("Fetch scenes failed : ", e);
        Notification.show(`Failed to fetch scenes with error : ${e.message}`);

      } finally {
        this.isLoading = false;
      }
    })();
  }
  /**
   * Tells the backend to download this list of scenes
   */
  onDownloadScenes = (ev) => {
    ev.preventDefault();
    this.run(async () => {
      let u = new URL("/files/download", window.location.href);
      console.log("Scenes : ", this.desiredScenes().slice(0, 10).map(s => `${s.name}: ${s.selected}`));
      console.log("Local Scenes : ", this.scenes.slice(0, 10));
      console.log("Remote scenes : ", this.remoteScenes.slice(0, 10));
      for (let s of this.desiredScenes()) {
        
        if (s.selected) u.searchParams.append("id", s.id);
      }
      let r = await fetch(u);
      if(r.status == 304) return;
      else if (!r.ok ) throw await HTTPError.fromResponse(r);

    }).then(()=>this.updateScenes(), e => {
      console.error(e);
      Notification.show(`Failed to download remote scenes : ${e.message}`, "error");
    });

  }

}
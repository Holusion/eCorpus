import { LitElement, customElement, html, property } from "lit-element";

import Notification from "../composants/Notification";

import "../composants/TagList";
import "../composants/SceneCard";
import Notifications from "../composants/Notification";
import { Scene } from "../state/withScenes";
import { withUser } from "../state/auth";

export interface Tag{
  name :string;
  size :number;
}


@customElement("tags-screen")
export default class TagsScreen extends withUser(LitElement){

  @property({attribute: false, type: Array})
  tags :Tag[] = [];

  @property({attribute:false, type: Number})
  selected :number = -1;

  @property({attribute:false, type: Array})
  scenes :Scene[] = [];

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
      this.fetchTags();
  }


  public disconnectedCallback(): void {
    this.#c.abort();
  }


  public update(changedProperties: Map<string | number | symbol, unknown>): void {
    if(changedProperties.has("selected")){
      this.fetchTag();
    }
    super.update(changedProperties);
  }


  async fetchTags(){
    const signal = this.#c.signal;
    await fetch(`/tags`, {signal}).then(async (r)=>{
      if(!r.ok) throw new Error(`[${r.status}]: ${r.statusText}`);
      let body = await r.json();
      if(signal.aborted) return;
      this.tags = body;
    }).catch((e)=> {
      if(e.name == "AbortError") return;
      console.error(e);
      Notification.show(`Failed to fetch scene scene: ${e.message}`, "error");
    });
  }

  async fetchTag(){
    this.scenes = [];
    if(this.selected === -1 ) return;
    const signal = this.#c.signal;
    await fetch(`/tags/${encodeURIComponent(this.tags[this.selected].name)}`, {signal}).then(async (r)=>{
      if(!r.ok) throw new Error(`[${r.status}]: ${r.statusText}`);
      let body = await r.json();
      if(signal.aborted) return;
      this.scenes = body;
      console.log("Scenes : ", this.scenes);
    }).catch((e)=> {
      if(e.name == "AbortError") return;
      console.error(e);
      Notification.show(`Failed to fetch scene scene: ${e.message}`, "error");
    });
  }

  handleTagClick = (e:CustomEvent<string>)=>{
    const tagText = e.detail;
    const tagIndex = this.tags.findIndex((t)=> this.formatTag(t) === tagText);
    if(tagIndex === -1) return Notifications.show(`Can't find tag matching ${tagText}`, "error");
    if(this.selected === tagIndex){
      this.selected = -1;
      return;
    }
    this.selected = tagIndex;
  }

  formatTag({name, size}:Tag){
    return `${name} (${size})`;
  }

  render(){
    console.log("Tags :", this.tags);
    return html`<div>
      <h2>Tags</h2>
      <div class="section">
        ${this.tags.length?html`
          <tag-list @click=${this.handleTagClick} .tags=${this.tags.map(this.formatTag)} .selected=${this.selected}></tag-list>
        `:html`No tags found on this instance. Head over to the <a href="/ui/scenes/">search</a> page to create tags`}
      </div>

      ${this.selected != -1? html`<div class="section">
        <h4>${this.tags[this.selected].name}</h4>
        <div>
          ${this.scenes.map(scene=>{
            return html`<scene-card 
              cardStyle="list"
              name=${scene.name}
              .thumb=${scene.thumb} 
              .time=${scene.mtime}
              access=${(("access" in scene)?((this.user?.isAdministrator)?"admin":scene.access.user): "none")}

            ></scene-card>`
          })}
        </div>
      </div>`:null}
    </div>`;
  }
}
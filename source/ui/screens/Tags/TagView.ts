import { LitElement, customElement, html, property } from "lit-element";

import Notification from "../../composants/Notification";

import "../../composants/TagList";
import "../../composants/SceneCard";

import { withUser } from "../../state/auth";
import { Scene } from "../../state/withScenes";

export interface Tag{
  name :string;
  size :number;
}


@customElement("tag-view")
export default class TagView extends withUser(LitElement){

  @property({attribute: true, type: String})
  tag :string;
  
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
  }


  public disconnectedCallback(): void {
    this.#c.abort();
  }


  public update(changedProperties: Map<string | number | symbol, unknown>): void {
    if(changedProperties.has("tag")){
      this.fetchTag();
    }
    super.update(changedProperties);
  }


  async fetchTag(){
    this.scenes = [];
    const signal = this.#c.signal;
    await fetch(`/tags/${encodeURIComponent(this.tag)}`, {signal}).then(async (r)=>{
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

  formatTag({name, size}:Tag){
    return `${name} (${size})`;
  }

  render(){
    return html`<div class="section">
        <h4>${this.tag}</h4>
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
      </div>`;
  }
}
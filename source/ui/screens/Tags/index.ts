import { LitElement, customElement, html, property } from "lit-element";

import Notification from "../../composants/Notification";

import "../../composants/TagList";
import "../../composants/SceneCard";
import { withUser } from "../../state/auth";
import { navigate, route, router } from "../../state/router";

import "./TagView";


export interface Tag{
  name :string;
  size :number;
}


@customElement("tags-screen")
export default class TagsScreen extends router(withUser(LitElement)){
  path="/ui/tags/";
  @route()
  static "/" = ()=> null;
  @route()
  static "/:tag/" = ({params})=> html`<tag-view tag=${params.tag}></tag-view>`;

  @property({attribute: false, type: Array})
  tags :Tag[] = [];

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


  handleTagClick = (e:MouseEvent)=>{
    e.preventDefault();
    e.stopPropagation();
    navigate(this, (e.target as HTMLAnchorElement).href);
  }

  formatTag({name, size}:Tag){
    return `${name} (${size})`;
  }

  render(){
    const selection = this.tags.find((t)=>this.isActive(`${t.name}`));

    return html`
      <a href="/ui/tags/"><h2>Tags</h2></a>
      ${selection? this.renderContent(): html`
        <div class="section" style="display: flex; flex-direction: row; flex-wrap: wrap; gap: .5rem;justify-content:center;">
          ${this.tags.map((tag, index)=>html`<a class="btn" style="overflow: hidden; text-overflow:ellipsis" href="/ui/tags/${encodeURIComponent(tag.name)}" @click=${this.handleTagClick}>
            ${this.formatTag(tag)}
          </a>`)}
          ${this.tags.length? null: html`<p>No tags found on this instance. Head over to the <a href="/ui/scenes/">search</a> page to create tags</p>`}
        </div>
      `}
    `;
  }
}
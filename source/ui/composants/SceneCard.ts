import { LitElement, customElement, property, html, TemplateResult, css } from "lit-element";

import defaultSprite from "../assets/images/defaultSprite.svg";

import i18n from "../state/translate";
import { AccessType, AccessTypes, Scene } from "../state/withScenes";





/**
 * Main UI view for the Voyager Explorer application.
 */
 @customElement("scene-card")
 export default class SceneCard extends i18n(LitElement)
 {
    @property()
    thumb :string;

    @property()
    name :string;

    @property()
    time :string;

    @property({type :String})
    access :AccessType = "none";

    @property({type:String})
    cardStyle :"list"|"grid";

    @property({type: Function})
    onChange :(ev :Event)=>any;

    get path (){
      return `/scenes/${this.name}/`
    }

    can(a :AccessType) :boolean{
      return AccessTypes.indexOf(a ) <= AccessTypes.indexOf(this.access);
    }

    constructor()
    {
        super();
    }
 
    public connectedCallback(): void {
        super.connectedCallback();

        if(this.cardStyle == "list") this.classList.add("card-list");
        if(this.cardStyle == "grid") this.classList.add("card-grid");
    }

    public disconnectedCallback(): void {
    }

    protected render() :TemplateResult {
      let explorer = `/ui/scenes/${encodeURIComponent(this.name)}/view`;
      let story = `/ui/scenes/${encodeURIComponent(this.name)}/edit`;
      return html`
        <div class="scene-card-inner ${this.cardStyle == "list" ? "scene-card-inner-list": ""}">
            <div style="display:flex; flex:auto; align-items:center;">
              <a href="${explorer}">
                ${this.thumb? html`<img src="${this.thumb}"/>`: html`<img style="background:radial-gradient(circle, #103040 0, #0b0b0b 100%);" src="${defaultSprite}" />`}
              </a>
              <div class="infos">
                <h4 class="card-title">${this.name}</h4>
                <p class="card-ctime">${this.time? new Date(this.time).toLocaleString(this.language) : ""}</p>
              </div>          
            </div>
            <div class="tools">
              ${this.can("read")? html`<a href="${explorer}">
                <ui-icon name="eye"></ui-icon>
                <span class="tool-text">${this.t("ui.view")}</span>
              </a>`:null}
              ${this.can("write")? html`<a class="tool-link" href="${story}">
                <ui-icon name="edit"></ui-icon>
                <span class="tool-text">${this.t("ui.edit")}</span>
              </a>`:null}
              ${this.can("admin")? html`<a class="tool-properties" href="/ui/scenes/${this.name}/" title="propriétés de l'objet">
                <ui-icon name="admin"></ui-icon>
                <span class="tool-text">${this.t("ui.admin")}</span>
              </a>`:null}
            </div>
        </div>
        ${(this.onChange? html`<span class="pill">
            <input type="checkbox" name="${this.name}" @change=${this.onChange} name="isAdministrator" id="isAdministrator">
        </span>`:null)}`;
    }

    static styles = [css`
      :host {
        width: 100%;
        display: flex;
        align-items: center;
      }

      .scene-card-inner{
        background-color: var(--color-element);
        box-sizing: border-box;
        padding: .5rem;
        width: 100%;
        height: 100%;
        border-radius: 4px;
        border: 2px solid var(--color-highlight);
        transition: background 0.2s;
        overflow: hidden;
      }

      .scene-card-inner:hover{
        background-color: var(--color-highlight);
        box-shadow: 2px 2px 4px rgba(0,0,0,0.2);
      }

      @media (min-width: 664px){
        .scene-card-inner-list{
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
      }

      .scene-card-inner-list{
        padding: 0.5rem;
      }

      .scene-card-inner img {
        aspect-ratio: 1 / 1;
        width: 70px;
        height: fit-content;
        border-radius: 4px;
        border: 1px solid var(--color-highlight);
      }
      .scene-card-inner-list img{
        height: auto;
      }
      .infos{
        width: 70%;
      }
      .infos > *{
        padding: 0 0.75rem;
      }

      .tools{
        max-width: 100%;
        margin-top: 0.5rem;
        display:flex;
        justify-content: space-around;
        overflow: hidden;
      }

      .scene-card-inner-list .tools{
        margin: 0rem;
      }

      .tools a{
        margin: 2px;
        color: #eee;
        text-decoration: none;
        padding: 0 0.5rem;
        min-width: 24px;
        display: flex;
        justify-content: center;
        flex-wrap: wrap;
      }
      .tools a:hover{
        color: var(--color-secondary-light);
      }

      .card-title{
        margin:0;
        white-space: nowrap;
        text-overflow: ellipsis;
        overflow: hidden;
      }
      .card-ctime{
        color: #6c757d;
        font-size: smaller;
      }
      .tools svg{
        width: inherit;
        height: 1rem;
        fill: currentColor;
        margin-right: 4px;
      }
      .pill{
        padding: 6px;
      }
      .pill input{
        width: 20px;
        height: 20px;
      }
  `]
 
 }
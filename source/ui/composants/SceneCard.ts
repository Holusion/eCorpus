import { LitElement, customElement, property, html, TemplateResult, css } from "lit-element";
import WebDAVProvider from "@ff/scene/assets/WebDAVProvider";
import i18n from "../state/translate";



export interface SceneProps{
  name  :string;
  uid   :number;
  ctime :string;
  mtime :string;
  author:string;
}


const settingsIcon = html`<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24"><path d="M12 20q-.825 0-1.412-.587Q10 18.825 10 18q0-.825.588-1.413Q11.175 16 12 16t1.413.587Q14 17.175 14 18q0 .825-.587 1.413Q12.825 20 12 20Zm0-6q-.825 0-1.412-.588Q10 12.825 10 12t.588-1.413Q11.175 10 12 10t1.413.587Q14 11.175 14 12q0 .825-.587 1.412Q12.825 14 12 14Zm0-6q-.825 0-1.412-.588Q10 6.825 10 6t.588-1.412Q11.175 4 12 4t1.413.588Q14 5.175 14 6t-.587 1.412Q12.825 8 12 8Z"/></svg>`


/**
 * Main UI view for the Voyager Explorer application.
 */
 @customElement("scene-card")
 export default class SceneCard extends i18n(LitElement)
 {
    static _assets = new WebDAVProvider();
    @property()
    thumb :string;

    @property()
    name :string;

    @property()
    mtime :Date;

    @property()
    url :string;

    @property({type :String})
    mode :"read"|"write";

    @property()
    styleCard :string;

    get path (){
      return `/scenes/${this.name}/`
    }

    constructor()
    {
        super();
    }
 
    public connectedCallback(): void {
        super.connectedCallback();

        if(this.styleCard == "list") this.classList.add("card-list");
        if(this.styleCard == "grid") this.classList.add("card-grid");
        
        if(this.thumb ) return;
        SceneCard._assets.get(this.path, false).then(p=>{
          let thumbProps = p.find(f=> f.name.endsWith(`-image-thumb.jpg`));
          if(!thumbProps) return console.log("No thumbnail for", this.name);
          this.thumb = thumbProps.url;
        }, (e)=>{
          console.warn("Failed to PROPFIND %s :", this.path, e);
        });
    }

    public disconnectedCallback(): void {
    }

    protected render() :TemplateResult {
      let explorer = `/ui/scenes/${encodeURIComponent(this.name)}/view?lang=${this.language.toUpperCase()}`;
      let story = `/ui/scenes/${encodeURIComponent(this.name)}/edit?lang=${this.language.toUpperCase()}`;
      return html`
        <div class="scene-card-inner ${this.styleCard == "list" ? "scene-card-inner-list": ""}" }>
            <div style="display:flex; flex:auto;">
              <a href="${explorer}">
                ${this.thumb? html`<img src="${this.thumb}"/>`: html`<img style="background:radial-gradient(circle, #103040 0, #0b0b0b 100%);" src="/images/defaultSprite.svg" />`}
              </a>
              <div class="infos">
                <h4 class="card-title">${this.name}</h4>
                <p class="card-ctime">${this.mtime}</p>
              </div>          
            </div>
            <div class="tools">
              <a href="${explorer}"><ff-icon name="eye"></ff-icon>${this.t("ui.view")}</a>
              ${this.mode === "write"? html`
                <a class="tool-link" href="${story}"><ff-icon name="edit"></ff-icon>${this.t("ui.edit")}</a>
                <a class="tool-properties" href="/ui/scenes/${this.name}/" title="propriétés de l'objet"><ff-icon name="admin"></ff-icon>${this.t("ui.admin")}</a>
              `: null}
            </div>
        </div>`;
    }

    static styles = [css`
      :host {
        display: block;
        width: 100%;
        flex: 0 0 auto;
      }

      .scene-card-inner{
        background-color: #000a;
        box-sizing: border-box;
        padding: 1rem;
        width: 100%;
        height: 100%;
        border-radius: 4px;
        border: 1px solid #103040;
      }

      .scene-card-inner:hover{
        background-color: #071922;
      }

      @media (min-width: 664px){
        .scene-card-inner-list{
          display: flex;
          justify-content: space-between;
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
        border: #103040 solid 1px;
      }
      .scene-card-inner-list img{
        width: 60px;
      }
      .infos{
        width: 70%;
      }
      .infos > *{
        padding: 0 0.75rem;
      }

      .tools{
        margin-top: 0.5rem;
        display:flex;
        justify-content: space-around;
      }
      .tools a{
        font-size: smaller;
        width: 100%;
        margin: 2px;
        color: #eee;
        text-decoration: none;
        display: flex;
        justify-content: center;
      }
      .tools a:hover{
        color: rgb(0, 165, 232);
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
      
  `]
 
 }
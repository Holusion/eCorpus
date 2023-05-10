import { LitElement, property, customElement, html, TemplateResult } from "lit-element";
import Notification from "@ff/ui/Notification";
import { withBusy } from "../state/busy";


@customElement("local-files-list")
export default class LocalFilesList extends withBusy(LitElement) 
{
  #c = new AbortController();

  @property({attribute: false, type: Array})
  files : Array<string>;

  @property({type: Boolean, attribute: false})
  isLoading :boolean = false;

  protected createRenderRoot(): Element | ShadowRoot {
    return this;
  }
  
  connectedCallback() {
    super.connectedCallback();
    this.refresh();
  }

  disconnectedCallback(){
    super.disconnectedCallback();
  }


  async refresh(){
    this.#c.abort();
    this.isLoading = true;
    this.#c = new AbortController();
    await fetch("/files/list", {signal: this.#c.signal}).then(async (res)=>{
      if(!res.ok) throw new Error(`[${res.status}]: ${res.statusText}`);
      this.files = await res.json();
    })
    .catch(e=>{
      console.error(e);
      Notification.show("Failed to refresh local files : "+e.message, "error");
    })
    .finally(()=>this.isLoading = false);
  }

  protected render()
  {
    if(this.isLoading){
      return html`<sv-spinner visible></sv-spinner>`;
    }

    return ((this.files?.length)?
      html`${this.files.map(file=> html`<ff-button class="list-item" transparent icon="file" name=${file} text=${file} @click=${this.onCopyFile}></ff-button>`)}`:
      html`<div style="text-align:center;font-size:150%;padding: 2rem;">Aucun fichier trouvé</div>`);

  }

  onCopyFile = (ev :MouseEvent)=>{
    let name = (ev.target as HTMLButtonElement).name;
    this.run(async ()=>{
      let r = await fetch(`/files/copy/${name}`, {method: "POST"})
      if(!r.ok) throw new Error(`[${r.status}] ${await r.text()}`);
      Notification.show(`${name} copié`, "info", 3000);
      this.dispatchEvent(new CustomEvent("change"));
    }).catch( e =>{
      Notification.show(`impossible de copier ${name}: ${e.message}`, "error" );
    }).then(()=>this.isLoading = false);
  }

}
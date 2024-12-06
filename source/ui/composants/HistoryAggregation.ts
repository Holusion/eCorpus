import { css, customElement, html, LitElement, property, PropertyValues, state } from "lit-element";

import Notification from "../composants/Notification";
import i18n from "../state/translate";

import styles from '!lit-css-loader?{"specifier":"lit-element"}!sass-loader!../styles/common.scss';
import HttpError from "../state/HttpError";


export interface HistoryEntryJSON{
  name :string;
  id :number;
  generation :number;
  ctime :string;
  author_id :number;
  author :string;
  size :number;
  mime :string;
}

export type HistoryEntry = Omit<HistoryEntryJSON,"ctime"> & {ctime: Date};


type AggregatedEntry = [HistoryEntry, ...HistoryEntry[]];


interface EntryDiff{
  src: HistoryEntry;
  dst: HistoryEntry;
  diff: string;
}


function acceptsEntry(aggregate:AggregatedEntry, entry: HistoryEntry):boolean{
  if( !aggregate?.length) return false;
  const previousName = aggregate.find(a => a.name === entry.name);
  let start = new Date(aggregate[0].ctime.valueOf()).setHours(0, 0, 0, 0);

  if(!previousName && (entry.ctime.valueOf() - start) < 1000*3600*24) return true; //Unique names within 24h are auto-grouped
  else if((entry.ctime.valueOf() - aggregate[0].ctime.valueOf()) < 3600*1000 && previousName.author == entry.author) return true; //Changes within one hour by the same author are grouped
  return false;
}

function aggregate(aggregate: AggregatedEntry[], entry: HistoryEntry, entryIndex: number, array: HistoryEntry[]): AggregatedEntry[]{
  let currentPtr = aggregate.slice(-1)[0];
  if( acceptsEntry(currentPtr, entry) ) {
    currentPtr.push(entry);
  }else{
    currentPtr = [entry];
    aggregate.push(currentPtr);
  }

  return aggregate;
}


@customElement("history-entry-line")
export class HistoryEntryLine extends i18n(LitElement){
  #c = new AbortController();

  @property({attribute: false, type: String})
  scene :string;

  @property({attribute: true, type: Object })
  entry :HistoryEntry;

  @property()
  ariaExpanded: "true"|"false" = "false";

  @state()
  diff ?:Partial<EntryDiff>;


  fetchDiff(){
    this.#c.abort();
    this.#c = new AbortController();
    console.log("Fetch entry : ", this.scene, this.entry);
    fetch(`/history/${encodeURIComponent(this.scene)}/${this.entry.id.toString()}/diff`, {
      signal: this.#c.signal,
      headers: {"Accept": "application/json"},
    }).then(async (r)=>{
      await HttpError.okOrThrow(r);
      this.diff = await r.json();
    }).catch(e=>{
      if(e.name === "AbortError") return;
      console.error(e);
      this.diff = {diff: `Error failing diff : ${e.message}`}
    });
  }

  connectedCallback(): void {
    this.classList.add("history-entry-line")
    super.connectedCallback();
  }

  protected createRenderRoot(): Element | ShadowRoot {
    return this;
  }

  protected update(changedProperties: PropertyValues): void {
    if(changedProperties.has("ariaExpanded") || changedProperties.has("entry")){
      if(this.diff){
        changedProperties.set("diff", this.diff);
        this.diff = undefined;
      }
      if(this.ariaExpanded === "true"){
        this.fetchDiff();
      }
    }
    super.update(changedProperties);
  }


  renderDiff(){
    if(!this.diff) return html`<div class="history-entry-diff-block"><spin-loader ?visible=${true}></spin-loader></div>`;
    const {src, dst, diff} = this.diff;
    console.log("ctime :", new Date(src.ctime).valueOf());
    return html`<div class="history-entry-diff-block">
      <p>
        ${(src.size !=0 && src.size != dst.size)?  html`
          Size changed from
          <span class="text-info"><b-size b=${src.size}></b-size></span>
          to
          <span class="text-info"><b-size b=${dst.size}></b-size></span>
        ` : null}
        ${(new Date(src.ctime).valueOf() != 0)? html`Previous version was saved on <span class="text-info">${new Date(src.ctime).toLocaleString(this.language)}</span>`:null}
      </p>

      <h4>Diff:</h4>
      <pre><code>${diff.split("\n").map(line=>{
        let color = "light";
        if(line.startsWith("-")) color = "error";
        else if(line.startsWith("+")) color = "success";
        else if(line.startsWith("\\")) color = "warning";
        else if(line.startsWith("@")) color = "info";
        return html`<span class="text-${color}">${line}</span>\n`;
      })}</code></pre>
    </div>`;
  }


  render(){
    let entry = this.entry;
    let diff = {color:"warning", char: "~"};
    if(entry.generation == 1){
      diff = {color:"success", char: "+"};
    }else if(entry.size === 0){
      diff = {color:"error", char: "-"};
    }

    return html`<div class="history-detail-entry">
      <a class="history-detail-entry-header" @click=${()=>{
        if(this.ariaExpanded === "true"){
          this.ariaExpanded = "false";
          this.classList.remove("active");
        }else{
          this.ariaExpanded = "true";
          this.classList.add("active");
        }
      }}>
        <span>${entry.ctime.toLocaleString(this.language)}</span>
        <span class="text-${diff.color}" style="font-weight: bold">${diff.char}</span>
        <span style="flex-grow:1">${entry.name+((entry.mime =="text/directory")?"/":"")}</span>
        <span>${entry.size? html`<b-size b=${entry.size}></b-size>`:null}
        <span class="caret"></span>
      </a>
      <span class="history-detail-entry-action">
        <ui-button class="btn-main btn-small" style="flex:initial; height:fit-content;" title="${entry.name+"#"+entry.generation}" @click=${()=>this.onRestore(entry)} text="restore" icon="restore"></ui-button>
      </span>
    </div>
    ${(this.ariaExpanded === "true")?this.renderDiff(): null}
    `;
  }

  onRestore(entry :HistoryEntry){
    this.dispatchEvent(new CustomEvent("restore", {detail: entry, bubbles: true}));
  }
}


@customElement("history-aggregation")
export default class HistoryAggregation extends i18n(LitElement){
  @property({attribute: false, type: String})
  scene :string;

  @property({attribute: false, type: Array})
  entries :HistoryEntry[];

  @state()
  selected?:number;




  private renderAggregation = (v : AggregatedEntry, index :number)=>{
    let mainFile = v.slice(-1)[0]; //File we would restore to by default
    let name = (3 < v.length)? 
    html`${mainFile.name} <span style="text-decoration:underline;">${this.t("info.etAl", {count:v.length-1})}</span>`
    : v.map(e=>e.name).join(", ");

    let authors = Array.from(new Set(v.map(e=>e.author)))
    let authored = (3 < authors.length )? html`${authors.slice(-2).join(", ")} <span style="text-decoration:underline;">${this.t("info.etAl", {count:v.length-2})}</span>`: authors.join(", ");

    const selected = this.selected === index;
    return html`
      <div class="list-item${selected?" selected":""} history-version-block" @click=${()=>{this.selected = index}}>
        ${selected?html`
          <div class="history-detail-grid">
            ${v.map((entry, idx) => html`<history-entry-line ?disabled=${idx==0 && index == 0} .scene=${this.scene} .entry=${entry}></history-entry-line>`)}
          </div>
        `: html`
          <div style="flex: 1 0 6rem;overflow: hidden;text-overflow: ellipsis">
            <div class="tooltip" style="margin-bottom:5px" >${name}</div>
            <div style=""><b>${authored}</b> <span style="opacity:0.6; font-size: smaller">${v[0].ctime.toLocaleString(this.language)}</span></div>
          </div>
          ${index==0?html`<ui-button disabled transparent text="active">active</ui-button>`:html`<ui-button class="btn-main" style="flex:initial; height:fit-content;" title="restore" @click=${()=>this.onRestore(mainFile)} text="restore" icon="restore"></ui-button>`}
        `}
      </div>
    `
  }

  protected render(){
    //versions could easily be memcached if it becomes a bottleneck to compute on large histories. It is currently not though.
    let versions = this.entries.reduce(aggregate, []);
    return html`
        <div class="list-items">
          ${versions.map(this.renderAggregation)}
        </div>
        `
  }


  onRestore(entry :HistoryEntry){
    this.dispatchEvent(new CustomEvent("restore", {detail: entry}));
  }

  static styles = [
    styles,
    css`
      .history-version-block:not(.selected){
        cursor: pointer;
      }
      .list-items .list-item.selected{
        background: var(--color-highlight);
      }

      .history-detail-grid{
        display: flex;
        flex-direction: column;
        gap: 4px;
        width: 100%;
      }
      
      .history-entry-line{
        display: flex;
        flex-direction: column;
        align-items: stretch;
        padding: 0 .5rem;
        border-bottom: 1px solid var(--color-highlight2);
      }
      
      .history-entry-line.active{
        padding: .5rem;
        background: var(--color-element);
      }
      .history-entry-line[disabled] .btn{
        pointer-events: none;
        background: var(--color-section);
        color: #444;
      }

      
      .history-detail-entry{
        display: flex;
        flex-direction: row;
        justify-content: stretch;
        align-items: center;
        gap: 4px;
      }

      .history-detail-entry:hover{
        background: var(--color-element);
      }
      
      .history-detail-entry > .history-detail-entry-header{
        display block;
        flex-grow: 1;
        display: flex;
        flex-direction: row;
        justify-content: stretch;
        gap: 4px;
        cursor: pointer;
      }
      
      .history-detail-entry> .history-detail-entry-action{
        display block;
        flex-grow: 0;
      }

      .history-entry-diff-block > pre{
        max-height: 75vh; 
        overflow: auto;
        padding: .25rem 1rem .25rem .5rem;
        background: rgba(0, 0, 0, 0.4);
      }
    `
  ]
}
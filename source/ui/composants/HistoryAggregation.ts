import { css, customElement, html, LitElement, property, PropertyValues, state } from "lit-element";

import Notification from "../composants/Notification";
import i18n from "../state/translate";

import styles from '!lit-css-loader?{"specifier":"lit-element"}!sass-loader!../styles/common.scss';

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



function acceptsEntry(aggregate:AggregatedEntry, entry: HistoryEntry):boolean{
  if( !aggregate?.length) return false;
  const previousName = aggregate.find(a => a.name === entry.name);
  const dtime =  aggregate[0].ctime.valueOf() - entry.ctime.valueOf();
  console.log("dtime : ", dtime, 1000*60*60*24 )
  if(!previousName && dtime < 1000*60*60*24) return true; //Unique names within 24h are auto-grouped
  else if(dtime < 1000*60*60 && previousName.author == entry.author) return true; //Changes within one hour by the same author are grouped
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




@customElement("history-aggregation")
export default class HistoryAggregation extends i18n(LitElement){

  @property({attribute: false, type: Array})
  entries :HistoryEntry[];

  @state()
  selected?:number;


  private renderExtendedHistoryEntry = (n:HistoryEntry)=>{
    let diff = {color:"warning", char: "~"};
    if(n.generation == 1){
      diff = {color:"success", char: "+"};
    }else if(n.size === 0){
      diff = {color:"error", char: "-"};
    }
    return html`<div class="history-detail-entry">
      <span>${n.ctime.toLocaleString(this.language)}</span>
      <span class="text-${diff.color}" style="font-weight: bold">${diff.char}</span>
      <span style="flex-grow:1">${n.name} </span>
      <span>${n.size? html`<b-size b=${n.size}></b-size>` : n.mime==="text/directory"?"/":null}</span>
      <span>
        <ui-button class="btn-main btn-small" style="flex:initial; height:fit-content;" title="${n.name+"#"+n.generation}" @click=${()=>this.onRestore(n)} text="restore" icon="restore"></ui-button>
      </span>
    </div>`
  }


  private renderAggregation = (v : AggregatedEntry, index :number)=>{
    let mainFile = v.slice(-1)[0]; //File we would restore to by default
    let name = (3 < v.length)? 
    html`${mainFile.name} <span style="text-decoration:underline;">${this.t("info.etAl", {count:v.length-1})}</span>`
    : v.map(e=>e.name).join(", ");

    let authors = Array.from(new Set(v.map(e=>e.author)))
    let authored = (3 < authors.length )? html`${authors.slice(-2).join(", ")} <span style="text-decoration:underline;">${this.t("info.etAl", {count:v.length-2})}</span>`: authors.join(", ");
    
    const selected = this.selected === index;
    return html`
      <div class="list-item${selected?" selected":""} history-version-block" @click=${()=>{this.selected = index}} >
        ${selected?html`
          <div class="history-detail-grid">
            ${v.map(this.renderExtendedHistoryEntry)}
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
      .list-items .list-item.selected{
        background: var(--color-highlight);
      }

      .history-detail-grid{
        display: flex;
        flex-direction: column;
        gap: 4px;
        width: 100%;
      }

      .history-detail-entry{
        display: flex;
        flex-direction: row;
        justify-content: stretch;
        gap: 4px;
        border-bottom: 1px solid transparent;
      }
      .history-detail-entry:not(:last-child){
        border-bottom-color: var(--color-highlight2);
      }

      .history-detail-entry:hover{
        border-bottom-color: var(--color-element);
      }
      .history-detail-entry> *{
        display block;
        flex-grow: 0;
      }
    `
  ]
}
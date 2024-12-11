import { css, customElement, html, LitElement, property, PropertyValues, state, TemplateResult } from "lit-element";

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
type HistoryBucket = AggregatedEntry[];

interface EntryDiff{
  src: HistoryEntry;
  dst: HistoryEntry;
  diff: string;
}

interface HistorySummary{
  name :string|TemplateResult|TemplateResult[];
  authoredBy :string|TemplateResult|TemplateResult[];
  restorePoint :number;
  from: Date;
  to:Date;
  showDetails?: ()=>void;
}

/**
 * Slice an array of entries into an aggregation, adjusting the timeframe as needed
 * Base bucket duration is 1 minute.
 */
function bucketize(entries :HistoryEntry[], duration :number= (1/3)*24*60*60*1000/16384) :HistoryBucket{
  if(24*60*60*1000 < duration) throw new Error("Duration too long. Infinite loop?");
  if(entries.length <= 3) return entries.map(e=>([e]));
  let buckets :HistoryBucket = [];
  let current :AggregatedEntry = null;
  let bucket_end = 0;
  for(let e of entries){
    if(!current || e.ctime.valueOf()+ duration < bucket_end){
      bucket_end = e.ctime.valueOf();
      current = [e];
      buckets.push(current);
    }else{
      current.push(e);
    }
  }
  if(4 < buckets.length){
    return bucketize(entries, duration *2);
  }else if (buckets.length === 1){
    let sep = Math.floor(entries.length/2);
    return [entries.slice(0, sep), entries.slice(sep)] as any;
  }
  return buckets;
}

@customElement("history-entry-aggregate")
export class HistoryEntryAggregate extends i18n(LitElement){
  #c = new AbortController();

  @property({attribute: false, type: String})
  scene :string;

  @property({attribute: true, type: Object })
  entries :AggregatedEntry;

  @property({attribute: "aria-expanded", reflect: true})
  ariaExpanded: "true"|"false" = "false";

  @state()
  diff ?:Partial<EntryDiff>;

  protected toggleSelect = (e?:MouseEvent)=>{
    e?.stopPropagation();
    if(this.ariaExpanded === "true"){
      this.ariaExpanded = "false";
    }else{
      this.ariaExpanded = "true";
    }
  }


  fetchDiff(){
    this.#c.abort();
    this.#c = new AbortController();
    console.log("Fetch entry : ", this.scene, this.entries[0]);
    fetch(`/history/${this.scene}/${this.entries[0].id.toString()}/diff`, {
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
    if(changedProperties.has("ariaExpanded") || changedProperties.has("entries")){
      if(this.diff){
        changedProperties.set("diff", this.diff);
        this.diff = undefined;
      }
      if(this.ariaExpanded === "true" && this.entries.length === 1){
        this.fetchDiff();
      }
    }

    if(changedProperties.has("ariaExpanded")){

      if(this.ariaExpanded === "true"){
        this.classList.add("active");
      }else{
        this.classList.remove("active");
      }
    }
    
    super.update(changedProperties);
  }


  renderDiff(){
    if(!this.diff) return html`<div class="history-entry-diff-block"><spin-loader ?visible=${true}></spin-loader></div>`;
    const {src, dst, diff} = this.diff;

    const diffBlock = (this.entries[0].size != 0)?html`
      <h4>Diff:</h4>
      <pre><code>${diff.split("\n").map(line=>{
        let color = "light";
        if(line.startsWith("-")) color = "error";
        else if(line.startsWith("+")) color = "success";
        else if(line.startsWith("\\")) color = "warning";
        else if(line.startsWith("@")) color = "info";
        return html`<span class="text-${color}">${line}</span>\n`;
      })}</code></pre>
    `:null;
    
    return html`<div class="history-entry-diff-block">
      <p>
        ${(src.size !=0 && src.size != dst.size)?  html`
          Size changed from
          <span class="text-info"><b-size b=${src.size}></b-size></span>
          to
          <span class="text-info"><b-size b=${dst.size}></b-size></span>
          .
        ` : null}
        ${(new Date(src.ctime).valueOf() != 0)? html`Previous version was saved on <span class="text-info">${new Date(src.ctime).toLocaleString(this.language)}</span>`:null}
      </p>
      ${diffBlock}
    </div>`;
  }

  
  protected renderSummary({name, restorePoint, authoredBy, from, to}:HistorySummary){
    const selected = this.ariaExpanded === "true";
    
    const expand = (this.entries.length === 1)?html`
      <ui-button @click=${this.toggleSelect} class="btn btn-small btn-transparent btn-inline" text=${selected?"⌃":"⌄"}></ui-button>
    `: html`
      <ui-button @click=${this.toggleSelect} class="btn btn-primary btn-small btn-transparent btn-inline" text=${(selected? "-":"+")}></ui-button>
    `;

    const showDiff = (this.entries.length === 1)? html`
    <div style="display: flex;justify-content:end; max-width: 300px">
      <ui-button @click=${this.toggleSelect} class="btn btn-primary btn-small btn-transparent btn-inline" text=${this.t(selected?"info.hideDetails": "info.showDetails")}></ui-button>
    </div>`: null;
    
    const longAction = selected && this.entries.length === 1
    const action = html`<div style="display: flex;justify-content: end;">
      <ui-button
        style="margin-top:-1px"
        class="btn btn-primary ${(longAction)?"btn-outline":"btn-small btn-transparent hover-only"} btn-rollback"
        text=${this.t("info.restoreTo",{point:longAction?(to??from).toLocaleString(this.language): (to??from).toLocaleTimeString(this.language)})}
        @click=${(e:MouseEvent)=>{
          e.stopPropagation()
          this.onRestore(restorePoint)
        }}
        icon="restore"
      ></ui-button>
    </div>`;

    const toDate = (to.valueOf() != from.valueOf())? html` - <span style="opacity:0.75; font-size: 90%; font-family: monospace">${to.toLocaleTimeString(this.language)}</span>`: null;
    
    return html`<div class="history-point" @click=${(selected?null:this.toggleSelect)}>
      <div class="history-line-summary">
        ${expand}
        <span class="history-line-summary-name">
          ${name}
        </span>
        <div class="history-line-summary-additional">
          <span>${authoredBy}</span>
          <span style="opacity:0.75; font-size: 90%;font-family: monospace">${from.toLocaleTimeString(this.language)}</span>
          ${toDate}
        </div>
      </div>
      ${action}
    </div>
    ${showDiff}
    `;
  }

  protected renderEntry(entry:HistoryEntry){
    const selected = this.ariaExpanded === "true";
    let diff = {color:"warning", char: "~", text: this.t("ui.modified")};
    if(entry.generation == 1){
      diff = {color:"success", char: "+", text: this.t("ui.created")};
    }else if(entry.size === 0){
      diff = {color:"error", char: "-", text: this.t("ui.deleted")};
    }
    let name = html`
      <span style="flex-grow:1">${entry.name+((entry.mime =="text/directory")?"/":"")}</span>
    `
    let summary = this.renderSummary({
      name,
      restorePoint: entry.id,
      authoredBy: html`<span class="text-${diff.color}">${diff.text}</span> <i>${this.t("ui.by")}</i> <b>${entry.author}</b>`,
      from: entry.ctime,
      to: entry.ctime,
      showDetails: this.toggleSelect,
    });
    return (selected? ([summary, this.renderDiff()]): summary);
  }

  protected render() {
    const entries = this.entries;
    //If aggregate has only one file, render a developped view. Otherwise render a summary
    if( entries.length == 1){
      return this.renderEntry(entries[0]);
    }
    const selected = this.ariaExpanded === "true";

    if(selected){
      return bucketize(entries).map((bucket, index)=>html`<history-entry-aggregate id=${this.id+"-"+index.toString(10)}  aria-disabled=${index ===0? this.getAttribute("aria-disabled"): "false"} .scene=${this.scene} .entries=${bucket}></history-entry-aggregate>`);
    }


    let lastFile = entries[0]; //File we would restore to by default
    let names = entries.reduce((m,e)=>{
      let list = m.get(e.name);
      if(list){
        list.push(e);
      }else{
        m.set(e.name, [e]);
      }
      return m;
    },new Map<string, AggregatedEntry>());
    let name = (3 < names.size)? 
      html`<span class="expandable">${lastFile.name} </span><span class="show-more" title=${this.t("info.showDetails")}  @click=${this.toggleSelect}>${this.t("info.etAl", {count:entries.length-1})}</span>`
      : html`${[...names.entries()].map(([name, matches], index, a)=>{
        let specifier :string|TemplateResult = "";
        if(1 < matches.length) specifier =  matches.length.toString(10);
        else if(matches[0].generation === 1) specifier = html`<span class="text-success">+</span>`;
        else if(matches[0].size === 0) specifier = html`<span class="text-error">-</span>`;
        else specifier = html`<span class="text-warning">~</span>`;
        return html` <span class="expandable"> ${name} (${specifier})</span>${index < a.length - 1?",":""}`
      })}`;

    let authors = Array.from(new Set(entries.map(e=>e.author)))
    let authoredBy = (3 < authors.length )? html`
      ${authors.slice(-2).join(", ")}
      <span class="show-more" title=${this.t("info.showDetails")} @click=${this.toggleSelect}>${this.t("info.etAl", {count:entries.length-2})}</span>` :
      html` <i>${this.t("ui.by")}</i> <b>${authors.join(", ")}</b>`;  
    return  this.renderSummary({name, authoredBy, showDetails: this.toggleSelect, restorePoint: lastFile.id, from: entries.slice(-1)[0].ctime, to: lastFile.ctime})
  }

  onRestore(id:number){
    this.dispatchEvent(new CustomEvent("restore", {detail: id, composed: true}));
  }
}


@customElement("history-aggregation")
export default class HistoryAggregation extends i18n(LitElement){
  @property({attribute: false, type: String})
  scene :string;

  @property({attribute: false, type: Array})
  entries :HistoryEntry[];

  @state()
  selected?: number = -1;

  protected renderDay = (day :AggregatedEntry, index:number)=>{

    const handleCollapse = (ev :MouseEvent)=>{
      ev.stopPropagation();
      for (let el of this.shadowRoot.querySelectorAll(`#day-${index.toString(10)} [aria-expanded="true"]`)){
        el.ariaExpanded = "false";
      }
    }
    return html`<div class="history-day" id=${"day-"+index.toString(10)}>
      <h4 class="history-day-header" id=${"day-header-"+index.toString(10)}>
        • ${this.t("info.changeDay", {date: day[0].ctime.toLocaleDateString(this.language)})}
      </h4>
      <div class="history-day-content">
        <history-entry-aggregate aria-expanded="${1 <day.length?"true":"false"}" .scene=${this.scene} .entries=${day} id=${"day-group-"+index.toString(10)} aria-disabled=${index === 0? "true":"false"}></history-entry-aggregate>
      </div>
      <span class="caret" @click=${handleCollapse}></span>
    </div>`;
  }

  protected render(){
    let start_of_day = 0;
    let days:Array<[HistoryEntry, ...HistoryEntry[]]> = []; //day-grouped changes. days[0] has the latest changes
    //Entries is with newest files first so everything is backward
    for(let version of this.entries){
      //First, split versions by day
      if(version.ctime.valueOf() < start_of_day || !days.length){
        days.push([version]);
        start_of_day = new Date(version.ctime).setHours(0, 0, 0, 0);
      }else{
        //console.log("Add version : ", version.ctime.toLocaleDateString("fr"), new Date(new Date(version.ctime).setHours(0, 0, 0, 0) + 1000*3600*24), new Date(start_of_day));
        days[days.length - 1].push(version);
      }
    }

    return html`
        <div class="history-list">
          ${days.map(this.renderDay)}
        </div>
        `
  }

  static styles = [
    styles,
    css`
      .history-day{
        position: relative;
        .caret{
          cursor: pointer;
          position: absolute;
          top: 0;
          right: 0;
          display: none;
          &::before{
            content: "⌃";
            vertical-align: bottom;
          }
        }
        &:has(.history-entry-line.active){
          .caret{
            display: block;
          }
        }
      }
      
      .history-list{
        max-width: 850px;
        margin: auto;
      }

      .history-day-content{
        border-radius: 4px;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        margin-left: .5rem;
        padding: 4px;
      }
      

      .history-list .history-entry-line{
        border-top: 1px solid transparent;
        transition: border .5s ease-out;
        display: block;


        .btn-rollback.hover-only{
          opacity: 0;
          transition: opacity .2s;
          flex-direction: row-reverse;
            flex-wrap: nowrap;
        }

        &:hover:not(.active),
        &:hover:not(:has(.history-entry-line)) {
          border-top-color: var(--color-primary);
          & .btn-rollback.hover-only{
            opacity: 1;
          }
        }

        &[aria-disabled="true"] {
          border-top-color: transparent !important;
          > .history-point .btn-rollback {
            opacity: 0 !important;
          }
        }

        &.active:not(:has(.history-entry-line)){
          background: var(--color-element);
        }

        .history-point{
          display: flex;
          flex-direction: row;
          align-items: flex-start;
        }


        .history-line-summary{
          flex: 1 1 auto;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          padding: .5rem 0;

          .history-line-summary-name{
            font-size: 1.15em;
            .btn + *{
              padding-left: 1rem;
            }
          }

          .history-line-summary-additional{
            padding-left: 3.5rem;
          }
          
        }


      }



      .history-day-header{
        margin: .75rem 0 .25rem 0;
        font-family: var(--font-body);
        border-bottom: 2px solid var(--color-background);
        font-weight: bold;
      }

      .show-more{
        font-weight: bold;
      }
      .expandable:hover, .show-more:hover{
        cursor: pointer;
        text-decoration: underline;
      }

      .history-entry-diff-block{
        margin-bottom: .5rem;
        padding: 0 .5rem .5rem .5rem;
        pre{
          background: #111;
          overflow: auto;
          max-height: 75vh;
          max-width: 130ch;
          padding: 4px;
        }
      }
    `
  ]
}
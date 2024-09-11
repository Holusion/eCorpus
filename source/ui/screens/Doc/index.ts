
import { LitElement, css, customElement, html, property } from "lit-element";

import { unsafeHTML } from 'lit-html/directives/unsafe-html';
import styles from '!lit-css-loader?{"specifier":"lit-element"}!sass-loader!../../styles/common.scss';
import apiStyles from '!lit-css-loader?{"specifier":"lit-element"}!sass-loader!../../styles/apidoc.scss';

import definitions from "./openapi.yml";
import "./DocHome";


import "../../composants/Icon";
import "../../composants/Button";
import "../../composants/TagList";

import { Method, Operation, Path, Parameters } from "./oas";
import { navigate, route, router } from "../../state/router";


function resolveRefs<T>(t :T):T{
  if(typeof t !== "object") return t;
  if(Array.isArray(t)) return t.map(i=>resolveRefs(i)) as T;
  if(!("$ref" in t)) return t;
  if(typeof  t["$ref"] !== "string" || !t["$ref"].startsWith("#")){
    console.warn("Bad ref :",  t["$ref"]);
    return t;
  }
  const refs =  t["$ref"].slice(1).split("/");
  let ptr = definitions;
  for(let ref of refs){
    if(!ref) continue;
    if(typeof ptr[ref] === "undefined"){
      console.warn("Bad ref : ", t["$ref"]);
      return t;
    }
    ptr = ptr[ref];
  }
  return ptr as T;
}


const operations = resolveRefs(Object.entries(definitions.paths).map(([pathname, {parameters, summary, ...operations}])=>{
  return Object.entries(operations).map((op)=>([pathname, op[0], parameters, op[1]]));
}).flat()) as Array<[string, Method, Parameters, Operation]>;




console.log("Definitions : ", typeof definitions, definitions);

@customElement("user-doc")
export default class UserDoc extends router(LitElement){
  path = "/ui/doc";

  @route()
  static "/" = ()=> html`<doc-home></doc-home>`
  @route()
  static "/api/" = ({parent})=> UserDoc.renderTags(parent);
  @route()
  static "/api/:tag" = ({parent})=> UserDoc.renderTags(parent);

  createRenderRoot() {
    return this;
  }


  static renderTags(that :UserDoc){
    return definitions.tags.map((t)=>{
      const active = that.isActive(`/ui/doc/api/${t.name}`)
      return html`<tag-block ?expanded=${active} @select=${that.onTagClick} name=${t.name} .description=${t.description}></tag-block>`
    });
  }
  
  render(){
    let selIndex = definitions.tags.findIndex(t=>this.isActive(t.name));
    return html`
      <h2>eCorpus Documentation</h2>
      <div class="main-grid">
        <div class="grid-header" style="display:flex">
          <nav-link .selected=${this.isActive("/ui/doc/", true)} href="${this.path}/">Home</nav-link>
          <nav-link .selected=${this.isActive("/ui/doc/api/")} href="${this.path}/api/">API Doc</nav-link>
        </div>
        <div class="grid-toolbar">
          ${this.isActive("/ui/doc/api")?html `
            <div class="section">
              <h4>Sections</h4>
              <tag-list .selected=${selIndex} .tags=${definitions.tags.map(t=>t.name)} @click=${this.onTagClick}></tag-list>
            </div>
            <div class="section">
              <ui-button @click=${this.download} class="btn-main" icon="save" text="download openAPI specification"></ui-button>
            </div>
          `:null}
        </div>
        <div class="grid-content section">
          ${this.renderContent()}
        </div>

    `;
  }

  onTagClick = (ev :CustomEvent<string>) =>{
    navigate(this, this.isActive(`/ui/doc/api/${ev.detail}`)? `/ui/doc/api/`:`/ui/doc/api/${ev.detail}`);
  }

  download = ()=>{
    const el = document.createElement("a");
    el.setAttribute("href", `data:application/json;base64,`+btoa(JSON.stringify(definitions, null, 2)));
    el.setAttribute("download", "openapi.json");
    el.style.display = 'none';
    document.body.appendChild(el);
    el.click();
    document.body.removeChild(el);
  }
}

@customElement("tag-block")
export class TagBlock extends LitElement{
  @property({attribute: true, type: String})
  name :string;
  @property({attribute: false, type: String})
  description :string;

  @property({attribute: true, reflect: true, type: Boolean})
  expanded: boolean;

  @property({attribute:false, type: String})
  selected ?:string;

  handleClick = (e:MouseEvent)=>{
    e.preventDefault();
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent("select", {detail: this.name}));
  }

  handleSelect = (e:CustomEvent<string>)=>{

  }

  paths() :Array<[string, Path]> {
    return Object.entries(definitions.paths);
  }

  operations() :Array<[string, Method, Parameters, Operation ]>{
    return operations.filter(op=>op[3].tags?.indexOf(this.name)!= -1);
  }

  render(){
    return html`<div class="tag-line">
      <div class="tag-header" @click=${this.expanded?null:this.handleClick}>
        <h4>${this.name}</h4>
        <div class="tag-summary">
          ${unsafeHTML(this.description)}
        </div>
        <ui-icon @click=${this.handleClick} id="tag-caret" class="caret" name="caret-${this.expanded?"up":"down"}"></ui-icon>
      </div>
      <div class="tag-body">${this.expanded?this.operations().map(([pathname, method, parameters, operation])=>{
          return html`<op-line ?expanded=${this.selected === operation.operationId} method=${method} pathname=${pathname} .parameters=${parameters} .operation=${operation}></op-line>`
        }):null}</div>
    </div>`
  }
  static styles = [
    styles,
    apiStyles,
  ];
}


@customElement("op-line")
export class OperationLine extends LitElement{
  @property({attribute: true, reflect: true, type: String})
  method :Method;
  @property({attribute: true, reflect: true, type: String})
  pathname :string;

  @property({attribute: false, type: Object})
  operation :Operation;

  @property({attribute: false, type: Object})
  parameters :Parameters;

  @property({attribute: true, reflect: true, type: Boolean})
  expanded :boolean = false;

  createRenderRoot() {
    return this;
  }

  connectedCallback(): void {
    this.classList.add("path-line");
    super.connectedCallback();
  }

  protected update(changedProperties: Map<string | number | symbol, unknown>): void {
    if(changedProperties.has("pathname")){
      this.id = this.pathname;
    }
    super.update(changedProperties);
  }


  onclick = (ev: MouseEvent) => {
    ev.stopPropagation();
    this.expanded = !this.expanded;
  }

  render(){
    if(this.expanded) console.log("Operation :", this.parameters, this.operation);
    const methodName = (this.method.startsWith("x-"))? this.method.slice(2) :this.method;
    return html`
      <span class="method ${methodName}">
        ${methodName}
      </span>
      <span class="pathname">
        ${this.pathname}
        ${(this.expanded && this.parameters?.length)? html`
          <h4>Parameters</h4>
          ${this.parameters.map(p=>html`<div class="operation-parameters">
            <h5>${p.name}</h5>
            <div>
              ${unsafeHTML(p.description)}
            </div>
          </div>`)}
          
        `:null}
        </span>
      <span class="op-summary">${unsafeHTML(this.operation.description)}</span>
      <ui-icon  id="tag-caret" class="caret" name="caret-${this.expanded?"up":"down"}"></ui-icon>
    `;
  }
}
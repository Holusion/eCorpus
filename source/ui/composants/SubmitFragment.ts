import { css, html, LitElement, PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import "./Spinner";
import HttpError from "../state/HttpError";

@customElement("submit-fragment")
export default class SubmitFragment extends LitElement{
  /**
   * Route to call. Defaults to the value of `::slotted(form).action`.
   */
  @property({attribute: true, type: String})
  action ?:string;
  /**
   * Method to call with. Default to `::slotted(form).method`
   * Useful if method is not GET or POST
   */
  @property({attribute:true, type: String})
  method ?:string;

  /**
   * Content Encoding to use
   * Supports form-data or application/json 
   * If not provided, will default to "form.enctype" or "application/json"
   */
  @property({attribute: true, type: String})
  encoding ?:"application/x-www-form-urlencoded"|"application/json";

  @property({attribute: true, reflect: true, type: Boolean})
  active:boolean = false;

  @state()
  status ?:{type:"status"|"alert", text :string};

  #c?:AbortController;


  encode(f:HTMLFormElement, encoding:string):BodyInit{
    const data = new FormData(f);
    if(encoding === "application/x-www-form-urlencoded"){
      return data;
    }
    if(encoding !== "application/json"){
      throw new Error("Unsupported form encoding: "+encoding);
    }
    const values = Array.from(data.entries()).reduce((memo, [key, value]) => {
      let sr :FormDataEntryValue|FormDataEntryValue[];
      if(key in memo){
        sr = Array.isArray(memo[key])?[...memo[key], value]: [memo[key], value];
      }else{
        sr = value;
      }
      return { ...memo, [key]: sr};
    }, {});
    return JSON.stringify(values);
  }


  private async _do_submit(form:HTMLFormElement, signal){
    const action = this.action ?? form.action;
    const method = this.method ?? form.method;
    if(!action || !method) throw new Error(`Invalid request : [${method.toUpperCase()}] ${action}`)
    const encoding = this.encoding ?? form.enctype ?? form.encoding ?? "application/json";
    const body = this.encode(form, encoding);
    console.log("BODY", body);
    
    let res = await fetch(action, {
      method,
      body,
      signal,
      headers: {
        "Content-Type": encoding,
        "Accept": "application/json",
      }
    });
    await HttpError.okOrThrow(res);
  }

  onsubmit = (e:SubmitEvent)=>{
    this.#c?.abort();
    let c = this.#c = new AbortController();
    let form = e.target as HTMLFormElement;
    if(!(form instanceof HTMLFormElement)){
      console.warn("Bad submit event on", form);
      this.status = {type:"alert", text:"Unhandled form submit event"};
      return;
    }
    e.preventDefault();
    this.active = true;
    if(this.status) this.status = undefined;
    this._do_submit(form, c.signal).then(()=>{
      this.active = false;
      this.status = {type:"status", text: "Submitted"};
      const t = setTimeout(()=> this.status = undefined, 5000);
      c.signal.addEventListener("abort", ()=>clearTimeout(t));
    }, (e)=>{
      console.error("Request failed : ", e);
      this.active = false;
      this.status = {type:"alert", text:e.message};
    });

    return false;
  }

  protected update(changedProperties: PropertyValues): void {

    super.update(changedProperties);
  }

  protected render(): unknown {
    return html`
      <slot aria-busy="${this.active?"true":"false"}" @submit=${this.onsubmit}></slot>
      ${this.status? html`<span role="${this.status.type}" class="submit-${this.status.type === "alert"?"error":"success"}">${this.status.text}</span>`: null}
      ${this.active?html`<spin-loader aria-live="assertive" visible></spin-loader>`:null}
    `;
  }
  static styles = css`
    :host(*){
      position: relative;
      display: block;
    }
    spin-loader{
      position: absolute;
      inset: 0;
    }
      
    :host([active]) ::slotted(form){
      user-select: none;
      pointer-events: none;
      opacity: 0.65;
    }

    .submit-error{
      display: block;
      text-align: center;
      color: var(--color-error);
    }
  `;
}
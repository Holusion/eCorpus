import { css, html, LitElement, PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import "./Spinner";
import HttpError from "../state/HttpError";

type SubmitResult = {success:false}|{success:true, data:FormData};

@customElement("submit-fragment")
export default class SubmitFragment extends LitElement{
  /**
   * Route to call. Defaults to the value of `::slotted(form).action`.
   * Order of precedence upon submission is :
   * - this.action
   * - submitter.formAction (auto-set to form.action if an HTMLInputElement)
   * - form.action (defaults to `window.location.href`)
   */
  @property({attribute: true, type: String})
  action ?:string;
  /**
   * Method to call with. Default to `::slotted(form).method`
   * Useful if method is not GET or POST.
   * Order of precedence upon submission is :
   * - this.method
   * - submitter.data-formmethod (if method is not GET|POST|dialog)
   * - submitter.formMethod
   * - form.method
   */
  @property({attribute:true, type: String})
  method ?:string;

  /**
   * Content Encoding to use
   * Supports form-data or application/json 
   * Order of precedence upon submission is :
   * - this.encoding
   * - submitter.formEnctype
   * - submitter.form.enctype
   * - submitter.form.encoding (deprecated per-spec)
   * - "application/json"
   */
  @property({attribute: true, type: String})
  encoding ?:"application/x-www-form-urlencoded"|"application/json";

  /** Set `submit=".*"` to submit form on any change
   * Or set this to a list of comma-separated names that should trigger a submit on change
  */
  @property({attribute: "submit", type: String, converter:(value, type)=> value.split(",")})
  submit ?:string[];

  /**
   * Internal property to manage submission status
   */
  @property({attribute: true, reflect: true, type: Boolean})
  active:boolean = false;

  @state()
  status ?:{type:"status"|"alert", text :string|TemplateResult};

  #c?:AbortController;


  encode(data :FormData, encoding:string):BodyInit{
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


  private async _do_submit(form:HTMLFormElement, submitter?:HTMLElement|HTMLButtonElement|HTMLInputElement) :Promise<SubmitResult>{
    this.#c?.abort();
    let c = this.#c = new AbortController();
    this.active = true;
    if(this.status) this.status = undefined;
    try{

      const action = this.action || submitter?.["formAction"] || form.action;
      let method = this.method ?? form.method;
      if(submitter?.dataset.formmethod) method = submitter.dataset.formmethod;
      else if(submitter && "formMethod" in submitter && submitter.formMethod) method = submitter.formMethod;
      if(!action || !method) throw new Error(`Invalid request : [${method.toUpperCase()}] ${action}`)
      const encoding = this.encoding || submitter?.["formEnctype"] || form.enctype || form.encoding || "application/json";

      const data = new FormData(form);
      //console.log("SUBMIT :", method, action, body);
      let res = await fetch(action, {
        method,
        body: this.encode(data, encoding),
        signal: c.signal,
        headers: {
          "Content-Type": encoding,
          "Accept": "application/json",
        }
      });
      await HttpError.okOrThrow(res);

      this.active = false;
      this.status = {type:"status", text: `✓`};

      const t = setTimeout(()=> this.status = undefined, 5000);
      c.signal.addEventListener("abort", ()=>clearTimeout(t));
      return {success:true, data};
    }catch(e){
      console.error("Request failed : ", e);
      this.active = false;
      this.status = {type:"alert", text:e.message};
      return {success:false};
    }
  }

  handleSubmit = (e:SubmitEvent)=>{
    let form = e.target as HTMLFormElement;
    if(!(form instanceof HTMLFormElement)){
      console.warn("Bad submit event on", form);
      this.status = {type:"alert", text:"Unhandled form submit event"};
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    this._do_submit(form, e.submitter).then((result)=>{
      if(result.success) this.dispatchEvent(new CustomEvent("submit", {detail: result.data}));
    });
    return false;
  }

  handleChange = (e :Event)=>{
    const target = e.target as HTMLSelectElement|HTMLInputElement;
    if(!this.submit) return false;
    if(this.submit.indexOf(target.name) === -1) return false;
    if(!target.form) return console.warn("Changed child has no associated form : ", target);
    e.preventDefault();
    e.stopPropagation();
    target.form.requestSubmit();
  }

  protected update(changedProperties: PropertyValues): void {

    super.update(changedProperties);
  }

  protected render(): unknown {
    return html`
      <slot aria-busy="${this.active?"true":"false"}" @submit=${this.handleSubmit} @change=${this.handleChange}></slot>
      ${this.status? html`<span role="${this.status.type}" class="submit-${this.status.type === "alert"?"error":"success"}">${this.status.text}</span>`: null}
      ${this.active?html`<slot name="loader"><spin-loader aria-live="assertive" visible></spin-loader></slot>`:null}
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
      z-index: 8;
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
    .submit-success{
      color: var(--color-success);
    }
  `;
}
import { css, html, LitElement, PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import "./Spinner";
import HttpError from "../state/HttpError";

type SubmitResult = {success:false}|{success:true, data:any};

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
  @property({attribute: "submit", type: String, converter:(value, type)=> value!.split(",")})
  submit ?:string[];

  /**
   * Internal property to manage submission status
   */
  @property({attribute: true, reflect: true, type: Boolean})
  active:boolean = false;

  @state()
  status ?:{type:"status"|"alert", text :string|TemplateResult};

  #c?:AbortController;


  encode(form :HTMLFormElement, encoding:string):BodyInit{
    if(encoding === "application/x-www-form-urlencoded"){
      return new FormData(form);
    }
    if(encoding !== "application/json"){
      throw new Error("Unsupported form encoding: "+encoding);
    }
    type JsonValue = string|number|boolean|File;
    const values :Record<string, JsonValue|JsonValue[]> = {};
    const addEntry = (key :string, value :JsonValue)=>{
      console.log("Add entry : ", key, value);
      if(key in values){
        const existing = values[key];
        values[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
      }else{
        values[key] = value;
      }
    };
    for(const el of Array.from(form.elements)){
      console.log("Iterate over element : ", el);
      if(!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) continue;
      if(!el.name || el.disabled) continue;
      if(el instanceof HTMLInputElement){
        switch(el.type){
          case "checkbox":
            // A checkbox with an explicit `value` attribute is part of a
            // multi-value group (e.g. tag chips) — only include checked ones,
            // using their value. Without an explicit value, treat as a plain
            // boolean toggle and send the checked state.
            if(el.hasAttribute("value")){
              if(el.checked) addEntry(el.name, el.value);
            }else{
              addEntry(el.name, el.checked);
            }
            break;
          case "number":
          case "range":
            if(el.value !== "") addEntry(el.name, el.valueAsNumber);
            break;
          case "radio":
            if(el.checked) addEntry(el.name, el.value);
            break;
          case "file":
            if(el.files) for(const file of el.files) addEntry(el.name, file);
            break;
          case "submit": case "reset": case "button": case "image": break;
          default: addEntry(el.name, el.value);
        }
      }else if(el instanceof HTMLSelectElement){
        if(el.multiple){
          for(const opt of Array.from(el.selectedOptions)) addEntry(el.name, opt.value);
        }else{
          addEntry(el.name, el.value);
        }
      }else{
        addEntry(el.name, el.value);
      }
    }
    return JSON.stringify(values);
  }


  private async _do_submit(form:HTMLFormElement, submitter?:HTMLElement|null) :Promise<SubmitResult>{
    this.#c?.abort();
    let c = this.#c = new AbortController();
    this.active = true;
    if(this.status) this.status = undefined;
    try{
      const s = (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) ? submitter : undefined;

      const action = this.action || s?.formAction || form.action;
      let method = this.method ?? form.method;
      if(submitter?.dataset.formmethod) method = submitter.dataset.formmethod;
      else if(s?.formMethod) method = s.formMethod;
      if(!action || !method) throw new Error(`Invalid request : [${method.toUpperCase()}] ${action}`)
      const encoding = this.encoding || s?.formEnctype || form.enctype || form.encoding || "application/json";

      const data = this.encode(form, encoding);
      let res = await fetch(action, {
        method,
        body: data,
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
    }catch(e: any){
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
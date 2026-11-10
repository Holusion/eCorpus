import { css, html, LitElement, PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { styleMap, StyleInfo } from "lit/directives/style-map.js";

import HttpError from "../state/HttpError";

type SubmitResult = {success:false}|{success:true, data:any};

/** How opaque a computed color is: rgba(…, a), or "/ a" in other notations */
function alphaOf(color :string) :number{
  if(!color || color === "transparent") return 0;
  const m = /\/\s*([\d.]+)(%?)\s*\)$/.exec(color) ?? /^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)()\)$/.exec(color);
  if(!m) return 1;
  return parseFloat(m[1]) / (m[2] ? 100 : 1);
}

/**
 * What's seen behind an element: its background, over those of its parents, down to the first that's opaque.
 * As a list of backgrounds, the first on top.
 */
function backgroundOf(el :Element|null) :string{
  const layers :string[] = [];
  for(; el; el = el.parentElement ?? (el.getRootNode() as ShadowRoot).host ?? null){
    const color = getComputedStyle(el).backgroundColor;
    const alpha = alphaOf(color);
    if(alpha === 0) continue;
    if(alpha === 1) return [...layers, color].join(", ");
    layers.push(`linear-gradient(${color}, ${color})`);
  }
  return [...layers, "var(--color-background)"].join(", ");
}

/**
 * Sends the form in it with fetch, and shows meanwhile that it's being sent: the form is dimmed,
 * and the spinning circle (<circle-loader>, see styles/loaders.scss) is on what sent it. Then a ✓, or why it failed.
 */
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

  /** Where the loader shows while it's sent, if not over all of it: see loaderOn() */
  @state()
  loaderPlace ?:StyleInfo;

  #c?:AbortController;
  /** What a change has sent, as the submit event doesn't tell */
  #changed ?:HTMLElement;
  /** Out of sight while it's sent, as the loader's in its place */
  #hidden ?:{el :HTMLElement, opacity :string};

  /**
   * The loader shows on what sent the form: in place of a button (or a checkbox) that's out of sight meanwhile,
   * or at the end of a field whose change sent it, where a select has its arrow: what's in it can still be read.
   * Over the whole of it otherwise.
   */
  private loaderOn(el ?:HTMLElement|null){
    this.restore();
    this.loaderPlace = undefined;
    //It may be out of it, with a form="…" attribute: it's still where it was sent from
    if(!el) return;
    const r = el.getBoundingClientRect(), host = this.getBoundingClientRect();
    if(!r.width || !r.height) return;
    const top = r.top - host.top, left = r.left - host.left;
    const isField = el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement
      || (el instanceof HTMLInputElement && !["checkbox", "radio", "submit", "button", "image", "reset"].includes(el.type));
    if(isField){
      const size = Math.min(r.height, r.width);
      this.loaderPlace = { top: `${top}px`, left: `${left + r.width - size}px`, width: `${size}px`, height: `${r.height}px`, background: backgroundOf(el) };
    }else{
      this.loaderPlace = { top: `${top}px`, left: `${left}px`, width: `${r.width}px`, height: `${r.height}px` };
      this.#hidden = { el, opacity: el.style.opacity };
      el.style.opacity = "0";
    }
  }

  private restore(){
    if(!this.#hidden) return;
    this.#hidden.el.style.opacity = this.#hidden.opacity;
    this.#hidden = undefined;
  }


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
      this.restore();
      this.status = {type:"status", text: `✓`};

      const t = setTimeout(()=> this.status = undefined, 5000);
      c.signal.addEventListener("abort", ()=>clearTimeout(t));
      return {success:true, data};
    }catch(e: any){
      //Aborted for another one, which has the loader now
      if(c !== this.#c) return {success:false};
      console.error("Request failed : ", e);
      this.active = false;
      this.restore();
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
    this.loaderOn(e.submitter ?? this.#changed);
    this.#changed = undefined;
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
    this.#changed = target;
    target.form.requestSubmit();
  }

  protected update(changedProperties: PropertyValues): void {

    super.update(changedProperties);
  }

  protected render(): unknown {
    return html`
      <slot aria-busy="${this.active?"true":"false"}" @submit=${this.handleSubmit} @change=${this.handleChange}></slot>
      ${this.status? html`<span role="${this.status.type}" class="submit-${this.status.type === "alert"?"error":"success"}">${this.status.text}</span>`: null}
      ${this.active?html`<circle-loader role="progressbar" class=${this.loaderPlace ? "placed" : ""} style=${styleMap(this.loaderPlace ?? {})}></circle-loader>`:null}
    `;
  }
  static styles = [css`
    :host(*){
      position: relative;
      display: block;
    }
    /* Over all of it, or on what sent it: see loaderOn() */
    circle-loader{
      position: absolute;
      inset: 0;
      width: auto;
      height: auto;
      z-index: 8;
    }
    circle-loader.placed{
      inset: auto;
      box-sizing: border-box;
      padding: 2px;
      border-radius: 4px;
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
  `];
}
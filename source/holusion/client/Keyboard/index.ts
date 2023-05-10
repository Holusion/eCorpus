import {LitElement, css, customElement, html, property} from "lit-element";

import keyMaps from "./layouts";
import { ELanguageType } from "client/schema/common";

function createOverlay(){
  const div = document.createElement("div");
  Object.assign(div.style, {
    position: "fixed",
    background: "rgba(0,0,0,0.2)",
    inset: "0",
    backdropFilter: "blur(3px)",
    zIndex: "9",
  });
  return div;
}



@customElement("virtual-keyboard")
export default class Keyboard extends LitElement{
  static _instance :Keyboard;
  static _focus :HTMLInputElement;
  
  static overlay = createOverlay();

  @property({attribute:false, type: Object})
  mods :Record<string, boolean> = {
    caps: false
  };
  @property({type: Boolean, attribute: true})
  active :boolean = false;


  static pick(target :HTMLInputElement){
    if(Keyboard._focus) Keyboard.release();
    Keyboard._focus = target;
    const parent = target.parentElement;
    if(!parent.style.position)parent.style.position = "relative";
    parent.style.zIndex = "11";
    parent.parentElement.appendChild(Keyboard.overlay);

  }

  static release(){
    Keyboard._focus.parentElement.parentElement.removeChild(Keyboard.overlay);
    const parent = Keyboard._focus.parentElement;
    if(parent.style.position ==="relative") parent.style.position = null;
    parent.style.zIndex = null;
    Keyboard._focus = null;
  }

  static focus(ev:FocusEvent){
    Keyboard._instance.setAttribute("active", "");

    if(! (ev.target instanceof HTMLInputElement)) return;
    Keyboard._instance.active = true;
    Keyboard.pick(ev.target);
  }

  static register(parent :HTMLElement|ShadowRoot = document.body){
    const kb = Keyboard._instance ??= new Keyboard();
    parent.appendChild(kb);
    return kb;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener("click", this.onClose)
    Keyboard.overlay.addEventListener("click", this.onClose);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener("click", this.onClose);
    Keyboard.overlay.removeEventListener("click", this.onClose);
  }

  onClose = ()=>{
    Keyboard.release();
    Keyboard._instance.removeAttribute("active");
    console.log("Close", Keyboard._instance.active);
  }
  
  onClick = (ev :PointerEvent)=>{
    ev.stopPropagation();
    const target = ev.target as HTMLSpanElement;
    let name = target.id;
    Keyboard._focus.focus();
    if(!name) return;
    switch(name){
      case "caps":
      case "altGR":
        this.mods = {...this.mods, [name]: !this.mods[name]};
        break;
      case "enter":
        this.onClose();
        break;
      case "space":
        Keyboard._focus.value += " ";
        break;
      case "backspace":
        Keyboard._focus.value = Keyboard._focus.value.slice(0,-1);
        break;
      default:
        Keyboard._focus.value += target.dataset.symbol;
    }

  }

  protected render() {
    let lang = ELanguageType.FR;
    let keyMap = keyMaps[lang] ?? keyMaps[0];
    return html`<div class="keyboard" @click=${this.onClick}>
      ${keyMap.map(keys=>html`<div class="keys">${keys.map(key=>{
        let {width="standard", activatable=false, name, symbol=name??"", fixed=false } = typeof key ==="string"? {name:key}: key;
        if(!symbol) return html`<span class="key empty ${width}${fixed?" fixed":""}"></span>`;

        let [base, caps, alt] = symbol.split(" ");
        let mainSymbol = base;
        let sup = ((base != caps)?caps: null);
        if(this.mods["caps"]){
          mainSymbol = caps ?? base.toUpperCase();
          if(caps) sup = base;
        }

        return html`<span class="key ${width}${activatable?" activatable":""}${fixed?" fixed":""}${this.mods[name] ? " activated":""}" data-symbol="${mainSymbol}" id="${name}">
          <span class="sup">${sup}</span>
          <span class="main">${mainSymbol}</span>
        </span>`;
      })}</div>`)}
    </div>`;
  }
  
  static styles = [
    css`
      :host {
        position: fixed;
        overflow: hidden;
        inset: 0;
        padding: 5px 5px;
        user-select: none;
        transition: bottom 0.4s;
      }
      :host(:not([active])){
        top:100%;
        bottom:-50%;
      }

      .keyboard{
        position: absolute;
        max-width:1200px;
        inset: auto 0 15px 0;
        margin: auto;
        padding: 10px;
        background-color: #222222;
        border-radius: 5px;
        touch-action: manipulation;
        display: flex;
        flex-direction: column;
        font-family: "Open Sans", "Roboto", sans-serif;
        font-weight: 700;
      }
      
      .keys{
        flex: 1 1 auto;
        display:flex;
        justify-content: stretch;
      }

      .key {
        flex: 1 1 6%;
        height: 45px;
        margin: 3px;
        border-radius: 4px;
        border: none;
        background: #646464;
        color: #ffffff;
        font-size: 1.05rem;
        outline: none;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        vertical-align: top;
        padding: 0;
        -webkit-tap-highlight-color: transparent;
        position: relative;

        display: flex;
        flex-direction: column;
        transition: background 0.4s;
      }

      .key .sup, .key .main{
        pointer-events: none;
      }

      .key .sup{
        color: #aaaaaa;
        font-size: 80%;
        font-weight: 400;
      }

      .key.empty{
        opacity: 0;
        pointer-events: none;
      }

      .key.fixed{
        flex-grow: 0;
      }
      .key.half{
        flex-basis: 3%;
      }
      .key.large{
        flex-basis: 9%;
      }
      .key.double{
        flex-basis: 12%;
      }
      .key.triple{
        flex-basis: 18%;
      }

      .key:active, .key:focus {
        transition: background 0s;
        background: rgb(0, 165, 232);
        color: white;
      }
      .key.activated {
        background: rgb(0, 81, 125);
        color: white;
      }
    `
  ]
}
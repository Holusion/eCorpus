import { LitElement, html, customElement, property, css, TemplateResult } from 'lit-element';

import i18n, {Localization} from '../../state/translate';

@customElement("change-locale")
export default class ChangeLocale extends i18n(LitElement){
  constructor(){
    super();
    this.addEventListener("click", (e) => this.onClick());
  }
  onclick = (ev :MouseEvent)=>{
    ev.preventDefault();

    return false;
  }
  protected createRenderRoot(): Element | ShadowRoot {
    return this;
  }
  
  onClick = ()=>{
    Localization.Instance.setLanguage(this.language == "fr"? "en": "fr");
  }

  protected render(): TemplateResult {
    return  html`<div class="">${this.language}</div>`;
  }
}
import { LitElement, PropertyValues, TemplateResult, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';


import i18n, {Localization} from '../../state/translate';
import { Language } from '../../state/strings';

@customElement("change-locale")
export default class ChangeLocale extends i18n(LitElement){
  @property({attribute: true})
  lang :Language;

  constructor(){
    super();
    this.addEventListener("click", (e) => this.onClick());
  }
  protected createRenderRoot(){
    return this;
  }
  
  protected update(changedProperties: PropertyValues): void {
    if(changedProperties.has("lang") && this.lang){
      Localization.Instance.setLanguage(this.lang);
    }
    super.update(changedProperties);
  }

  onClick = ()=>{
    console.log("Language :", this.language,)
    const here = new URL(window.location.href);
    here.searchParams.set("lang", this.language === "fr"?"en":"fr");
    window.location.href = here.toString();
  }

  protected render(): TemplateResult {
    return  html`<div class="">${this.lang || this.language}</div>`;
  }
}
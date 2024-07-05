import { LitElement, customElement, html } from "lit-element";
import i18n from "../../state/translate";


@customElement("doc-home")
export default class DocHome extends i18n(LitElement){

  createRenderRoot() {
    return this;
  }

  render(){
    return html`<div>
      <h4>Getting started</h4>
      <p>
        You can head over to the main <a target="_blank" href="https://ecorpus.eu">documentation reference</a>
        to learn more about the eCorpus database or to the <a href="https://smithsonian.github.io/dpo-voyager/">DPO Voyager</a> website to learn more specifically about voyager's features.
      </p>
      <h4>Integrating eCorpus</h4>
      <p>
        Developers might want to check out the <a href="/ui/doc/api/">API doc</a> (work in progress) to start experimenting.
      </p>
      <p>
    </div>`
  }
}
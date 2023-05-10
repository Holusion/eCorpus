import { LitElement, property, customElement, html, TemplateResult } from "lit-element";


@customElement("remote-scene-card")
export default class RemoteSceneCard extends LitElement
{
  @property()
  name: String;

  @property()
  time :string;

  @property()
  thumb: String;

  @property()
  selected: boolean;

  protected createRenderRoot(): Element | ShadowRoot {
    return this;
  }

  dispatchClick = (ev :MouseEvent)=>{
    this.dispatchEvent(new CustomEvent("click", {
      detail: {
        bubble: true,
      }
    }));
  }

  render() :TemplateResult {
      return html`<div name=${this.name} class=${`scene-card ${this.selected ? "selected" : ""}`} @click=${this.dispatchClick}>
        ${(this.thumb)? html`<img src="${this.thumb}"/>`: html`<img style="background:radial-gradient(circle, #103040 0, #0b0b0b 100%);" src="/images/defaultSprite.svg" />`}
        <span>${this.name}</span>
        <span style="opacity:0.5">${new Date(this.time).toLocaleString()}</span>
        ${this.selected ? html`<ff-icon name="check"></ff-icon>`:null}
      </div>`;
  }
 
}
import { LitElement, TemplateResult, css, html } from 'lit';
import { customElement } from 'lit/decorators.js';



@customElement("upload-button")
export default class UploadButton extends LitElement
{
  
  dispatchChange = (ev :MouseEvent)=>{
    ev.preventDefault();
    ev.stopPropagation();
  }

  render() :TemplateResult {
      return html`<label class="upload-btn" for="fileUpload"><slot></slot></label>
      <input 
        @change=${this.dispatchChange} id="fileUpload" 
        type="file"
        multiple
        hidden
      />`;
  }

  static readonly styles = css`
    .upload-btn{
      cursor: pointer;
    }

    :host([disabled]){
      pointer-events: none;
      filter: brightness(0.5);
    }
  `;
 
}
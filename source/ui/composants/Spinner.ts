import { LitElement, property, customElement, html, css } from "lit-element";


@customElement("spin-loader")
export default class Spinner extends LitElement{

  @property({type: Boolean})
  overlay :boolean = false;
  @property({type: Boolean})
  visible :boolean = false;



  render(){
    return html`<div id="loader" class="spin-loader${this.overlay?" loading-overlay":""}">
			<span class="loader"></span>
			<span class="load-text" id="load-text"><slot></slot></span>
    </div>`;
  }
  static readonly styles = [css`
    .spin-loader{
      position:relative;
    }
    
    .loading-overlay{
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      transition: opacity 0.5s ease-out;
      pointer-events: auto;
      z-index: 10;
    }
    
    :host:not([visible]) .loading-overlay{
      pointer-events: none;
      opacity: 0;
    }
    
    
    .loader {
      top: calc(50% - 48px);
      left: calc(50% - 48px);
      width: 96px;
      height: 96px;
      border: 6px solid #FFF;
      border-radius: 50%;
      display: inline-block;
      position: relative;
      box-sizing: border-box;
      animation: rotation 1s linear infinite;
      transition: transform 0.5s ease-out;
    }

    .loader::after {
      content: '';  
      box-sizing: border-box;
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 80px;
      height: 80px;
      border-radius: 50%;
      border: 6px solid;
      border-color: var(--color-primary) transparent;
    }
    
    .load-text{
      position: absolute;
      bottom:10px;
      left:0;
      right:0;
      text-align: center;
      font-size: 2rem;
    }
    .load-text:empty{
      display: none;
    }
    
    @keyframes rotation {
      0% {
        transform: rotate(0deg);
      }
      100% {
        transform: rotate(360deg);
      }
    } 
  `];
}
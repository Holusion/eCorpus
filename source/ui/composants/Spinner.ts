import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';


@customElement("spin-loader")
export default class Spinner extends LitElement{

  @property({type: Boolean, reflect: true})
  overlay :boolean = false;
  @property({type: Boolean, reflect: true})
  visible :boolean = false;

  @property({type: Boolean, reflect: true})
  inline :boolean = false;

  render(){
    return html`<div id="loader" class="spin-loader">
			<span class="loader"></span>
			<span class="load-text" id="load-text"><slot></slot></span>
    </div>`;
  }
  static readonly styles = [css`
    .spin-loader{
      position:relative;
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

    :host([overlay]) .spin-loader{
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      transition: opacity 0.5s ease-out;
      pointer-events: auto;
      z-index: 10;
    }
    :host([inline]) .spin-loader {
      display: inline-block;
      line-height: 1;
      height: 1em;
      width: 1em;
    }

    :host([inline]) .loader{
      top: calc(50% - .5em + 0.5px);
      left: calc(50% - .5em + 0.5px);
      height: calc(1em - 1px);
      width: calc(1em - 1px);
      border-width: 1px;
    }

    :host([inline]) .loader::after{
      width: 1em;
      height: 1em;
      border-width: 3px;
    }
    
    :host(:not([visible])) .spin-loader{
      pointer-events: none;
      opacity: 0;
    }
  `];
}
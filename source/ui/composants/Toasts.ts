import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { toast } from '../state/toast';

import styles from '!lit-css-loader?{"specifier":"lit"}!sass-loader!../styles/toasts.scss';


export type ToastLevel = "info" | "success" | "warning" | "error";



const _levelIcons = {
    "info": "info",
    "success": "check",
    "warning": "warning",
    "error": "error"
};

const _levelTimeouts = {
    "info": 2000,
    "success": 2000,
    "warning": 5000,
    "error": 0
} as const;


@customElement("toast-line")
export class Toast extends LitElement{
  @property({ type: String })
  message: string;

  @property({ type: String })
  level: ToastLevel;

  @property({ type: Number })
  timeout: number;

  /** Where to find out more about it */
  @property({ type: String })
  link ?:string;

  @property({ type: Boolean })
  fade :boolean = false;

  /** What it tells about isn't over yet: a task that's running, as notifications show it */
  @property({ type: Boolean })
  busy :boolean = false;


  createRenderRoot() {
    return this;
  }

  constructor(message?: string, level?: ToastLevel, timeout?: number)
  {
      super();
      this.message = message || "<message>";
      this.level = level || "info";
      this.timeout = timeout !== undefined ? timeout : _levelTimeouts[this.level];
  }

  render(){
    return html`
      <div class="toast toast-${this.level}${this.fade?" fade":""}">
        ${this.busy ? html`<cube-loader></cube-loader>` : html`<ui-icon name="${_levelIcons[this.level]}"></ui-icon>`}
        <span class="toast-message">${this.link ? html`<a href=${this.link}>${this.message}</a>` : this.message}</span>
        <span class="toast-close" @click=${this.remove}>×</span>
      </div>
    `;
  }

  remove(){
    this.fade = true;
    setTimeout(()=>{
      if (this.parentNode) {
        this.parentNode.removeChild(this);
      }
    }, 500);
  }

}

/**
 * Toast stack implementation.
 * This is a very rough implementation that won't support any sort of nested stacks.
 */
@customElement("toast-stack")
export default class Toasts extends LitElement{
  /** For scripts that only have the element at hand, such as inline ones in templates. Modules can use `toast()` from state/toast.ts */
  static show(message: string, level?: ToastLevel, timeout?: number) :()=>void{
    return toast(message, level, timeout);
  }

  render(){
    return html`<div class="toasts"><slot></slot></div>`;
  }

  static readonly styles = [styles];
}

import { LitElement, css, customElement, html, property } from "lit-element";

import "./Icon";

import styles from '!lit-css-loader?{"specifier":"lit-element"}!sass-loader!../styles/notifications.scss';


type NotificationLevel = "info" | "success" | "warning" | "error";



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


@customElement("notification-line")
class Notification extends LitElement{
  @property({ type: String })
  message: string;

  @property({ type: String })
  level: NotificationLevel;

  @property({ type: Number })
  timeout: number;

  @property({ type: Boolean })
  fade :boolean = false;


  createRenderRoot() {
    return this;
  }

  constructor(message?: string, level?: NotificationLevel, timeout?: number)
  {
      super();
      this.message = message || "<message>";
      this.level = level || "info";
      this.timeout = timeout !== undefined ? timeout : _levelTimeouts[this.level];
  }

  render(){
    return html`
      <div class="notification notification-${this.level}${this.fade?" fade":""}">
        <ui-icon name="${_levelIcons[this.level]}"></ui-icon>
        <span class="notification-message">${this.message}</span>
        <span class="notification-close" @click=${this.remove}>×</span>
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
 * Notification stack implementation.
 * This is a very rough implementation that won't support any sort of nested stacks.
 */
@customElement("notification-stack")
export default class Notifications extends LitElement{
  static container: HTMLElement = null;
  static show(message: string, level?: NotificationLevel, timeout?: number){
    let line = new Notification(message, level, timeout);
    if(!Notifications.container){
      return console.error("Notification stack not configured. Please mount <notification-stack> in your DOM before calling Notification.show");
    }
    Notifications.container.appendChild(line);
    if(0 < timeout) setTimeout(()=>{
      line.remove();
    }, line.timeout);
  }

  connectedCallback(){
    super.connectedCallback();
    if(Notifications.container){
      console.error("Notification stack already configured. Please mount <notification-stack> only once in your DOM");
    }else{
      Notifications.container = this;
    }
  }
  
  disconnectedCallback(): void {
    super.disconnectedCallback();
    if(Notifications.container === this){
      Notifications.container = null;
    }
  }
  render(){
    return html`<div class="notifications"><slot></slot></div>`;
  }

  static readonly styles = [styles];
}
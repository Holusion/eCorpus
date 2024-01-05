import { LitElement, customElement, property } from "lit-element";


type NotificationLevel = "info" | "success" | "warning" | "error";

const _levelClasses = {
    "info": "notification-info",
    "success": "notification-success",
    "warning": "notification-warning",
    "error": "notification-error"
} as const;

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

}


@customElement("notification-stack")
export default class Notifications extends LitElement{
  static container: HTMLElement = null;
  static show(message: string, level?: NotificationLevel, timeout?: number){
    let line = new Notification(message, level, timeout);
    if(!Notifications.container){
      return console.error("Notification stack not configured. Please mount <notification-stack> in your DOM before calling Notification.show");
    }
  }

}
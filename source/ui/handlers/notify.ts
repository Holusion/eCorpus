import type { NotificationLevel, Notification } from "../composants/Notification";

export function notify(message: string, level?: NotificationLevel, timeout?: number) :()=>void{
  const containers = document.querySelectorAll("notification-stack");
  if(!containers.length){
    console.error("Notification stack not configured. Please mount <notification-stack> in your DOM before calling Notification.show");
    return ()=>{};
  }else if(1 < containers.length){
    console.error("More than one notification stack found. Page seems misconfigured");
  }
  let line = document.createElement("notification-line") as Notification;
  line.message = message;
  line.level = level;
  if(typeof timeout !== "undefined") line.timeout =  timeout;
  containers[0].appendChild(line);
  if(0 < timeout) setTimeout(()=>{
    line.remove();
  }, line.timeout);
  
  return line.remove.bind(line);
}
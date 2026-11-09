import type { Toast, ToastLevel } from "../composants/Toasts";

/**
 * Shows a toast in the page's `<toast-stack>`.
 * Without Lit, for bundles that don't load it: the elements are registered by the main bundle.
 * @returns a function that removes it
 */
export function toast(message: string, level?: ToastLevel, timeout?: number, link?: string) :()=>void{
  const containers = document.querySelectorAll("toast-stack");
  if(!containers.length){
    console.error("Toast stack not configured. Please mount <toast-stack> in your DOM before showing toasts");
    return ()=>{};
  }else if(1 < containers.length){
    console.error("More than one toast stack found. Page seems misconfigured");
  }
  let line = document.createElement("toast-line") as Toast;
  line.message = message;
  line.level = level;
  if(link) line.link = link;
  if(typeof timeout !== "undefined") line.timeout =  timeout;
  containers[0].appendChild(line);
  if(0 < timeout) setTimeout(()=>{
    line.remove();
  }, line.timeout);
  
  return line.remove.bind(line);
}

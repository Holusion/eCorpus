import type { Toast, ToastLevel } from "../composants/Toasts";

/**
 * Shows a toast in the page's `<toast-stack>`, and gives it back: what it shows can change while it's there.
 * Without Lit, for bundles that don't load it: the elements are registered by the main bundle.
 * @param timeout how long it stays. Without one, or with 0, it stays until it's closed.
 * @returns the toast, or nothing if the page has nowhere to show it
 */
export function showToast(message: string, level?: ToastLevel, timeout?: number, link?: string) :Toast|null{
  const containers = document.querySelectorAll("toast-stack");
  if(!containers.length){
    console.error("Toast stack not configured. Please mount <toast-stack> in your DOM before showing toasts");
    return null;
  }else if(1 < containers.length){
    console.error("More than one toast stack found. Page seems misconfigured");
  }
  let line = document.createElement("toast-line") as Toast;
  line.message = message;
  line.level = level;
  if(link) line.link = link;
  if(typeof timeout !== "undefined") line.timeout =  timeout;
  containers[0].appendChild(line);
  if(typeof timeout !== "undefined" && 0 < timeout) dismissAfter(line, timeout);
  return line;
}

/** For a toast that's there until told otherwise: it goes after that long */
export function dismissAfter(line: Toast, timeout: number){
  setTimeout(()=>{
    line.remove();
  }, timeout);
}

/**
 * Shows a toast in the page's `<toast-stack>`
 * @returns a function that removes it
 */
export function toast(message: string, level?: ToastLevel, timeout?: number, link?: string) :()=>void{
  const line = showToast(message, level, timeout, link);
  return line ? line.remove.bind(line) : ()=>{};
}

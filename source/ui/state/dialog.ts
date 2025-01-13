import { html, render, TemplateResult } from "lit";

type DialogTemplatePart = TemplateResult|string|HTMLElement;
interface DialogOptions{
  header?: DialogTemplatePart;
  body:DialogTemplatePart;
  buttons?:DialogTemplatePart;
  onClose?:(returnValue?:string)=>any;
}

interface ModalOptions extends DialogOptions{
  parent?: HTMLElement;
}

/**
 * Simple wrapper around HTMLDialogElement creation
 * @returns 
 */
export function createDialog({
  header,
  body,
  buttons, 
  onClose,
} :DialogOptions){
  const dialog = document.createElement("dialog");
  
  function handleClose(e:MouseEvent){
    dialog.close();
    if(typeof onClose === "function") onClose(dialog.returnValue);
  }

  render(html`
    ${header?html`<h2 class="dialog-header">${header}</h2>`:null}
    <div class="dialog-body">${body}</div>
    <div class="dialog-buttons">${buttons}</div>
    <button id="exit" @click=${handleClose}>
      <ui-icon name="close"></ui-icon>
    </button>
  `, dialog);
  return dialog;
}

/**
 * Create a dialog element, append it to a parent and handle its removal after close
 * @returns close function. Modal will be removed from DOM when this is called
 */
export function showModal({parent = document.body, ...opts }:ModalOptions):(returnValue?:string)=>void{
  const dialog = createDialog(opts);
  parent.appendChild(dialog);
  dialog.showModal();
  dialog.addEventListener("close", ()=>{
    //Let close animations play if required
    setTimeout(()=>parent.removeChild(dialog), 500);
  });
  return dialog.close.bind(dialog);
}

/**
 * Show a modal with its body embedded into a `<form>` element.
 * Upon submission, the promise will resolve with the resulting `FormData`.
 * If the modal is closed the promise will be rejected
 */
export async function showFormModal({body, parent, ...opts}:ModalOptions):Promise<FormData>{
  return new Promise((resolve, reject)=>{
    function onModalSubmit(ev:SubmitEvent){
      ev.preventDefault();
      resolve(new FormData(ev.target as HTMLFormElement));
      close("submit");
    }
    const close = showModal({
      ...opts,
      body: html`<form class="form-group" @submit=${onModalSubmit}>${body}</form>`,
      onClose(v){
        if(v!="submit") reject(new Error("Modal was closed"));
      }
    });

  });
}


/**
 * Shows a modal with a spinner whose lifetime is tied to the provided task (Promise)
 * @returns Whatever the embedded promise returned
 */
export function showTaskModal<T>(p:Promise<T>, opts :Omit<ModalOptions, "body">):Promise<T>{
  let close = showModal({
    ...opts,
    body: html`<div style="display:block;position:relative;padding-top:110px"><spin-loader visible></spin-loader></div>`,
  });
  return p.finally(()=>close());
}
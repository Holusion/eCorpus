import { css, CSSResultGroup, html, LitElement, PropertyValues } from "lit";
import { customElement, property, queryAssignedElements, state } from "lit/decorators.js";
import Notification from "./Notification";


@customElement("scene-selection")
export default class SceneSelection extends LitElement{
  @state()
  selection = [];


  registerForm(form:HTMLFormElement){
    let sceneCount = 0;

    const selectAll = form.querySelector("#selection-selectAll");
    const deselectAll = form.querySelector("#selection-deselectAll");
    const dlink = form.querySelector<HTMLAnchorElement>("#selection-download");
    const tagName = form.querySelector("#tag-name") as HTMLInputElement;
    const addTagg = form.querySelector("#add-tag");
    const removeTag = form.querySelector("#remove-tag");
    if(!dlink) return console.error(`Form has no download button`, form); 

    const updateButtons = ()=>{
      if (this.selection.length==0){
        dlink.setAttribute("disabled", "");
      } else {
        dlink.removeAttribute("disabled");
      }
      if(!dlink) return console.error("No download link found in children");
      const t = new URL(dlink.href);
      t.searchParams.delete("id");
      for(let id of this.selection){
        t.searchParams.append("id", id.toString(10));
      }
      t.searchParams.set("limit", this.selection.length.toString(10));
      dlink.href = t.toString();
    }

    selectAll?.addEventListener("click", (ev:MouseEvent)=>{
      ev.preventDefault();
      let new_selection = [];
      for(let i = 0; i < form.length; i++){
        const el = form.elements[i] as HTMLInputElement;
        if(el.type !== "checkbox" || el.name != "id") continue;
        el.checked = true;
        new_selection.push(el.value);
      }
      this.selection = new_selection;
      updateButtons();
    })

    deselectAll?.addEventListener("click", (ev:MouseEvent)=>{
      this.selection = [];
      updateButtons();
    });

    addTagg?.addEventListener("click", (ev: MouseEvent) => {
      ev.preventDefault();
      if (tagName.value.length > 0) {
        const body: { name: string, scene: number }[] = this.selection.map(
          (scene) => { return { name: tagName.value, scene: scene, action: "create" } });
        let xhr = new XMLHttpRequest();
        xhr.onerror = function onError(ev) {
          console.log("XHR Error", ev);
          Notification.show(`Tag could not be added`, "error", 4000);
        }
        xhr.onload = function onLoad(ev) {
          if (xhr.status < 300) {
            Notification.show(`Tag ${tagName.value} was added`, "success", 4000);
            tagName.value = "";
          } else {
            Notification.show(`Tag could not be added. ${JSON.parse(xhr.response).message}`, "error", 4000);
          }
        }
        xhr.open('PATCH', `/tags`);
        xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
        xhr.send(JSON.stringify(body));
      }
    })


    removeTag?.addEventListener("click", (ev: MouseEvent) => {
      ev.preventDefault();
      if (tagName.value.length > 0) {

        const body: { name: string, scene: number }[] = this.selection.map(
          (scene) => { return { name: tagName.value, scene: scene, action: "delete" } });
        let xhr = new XMLHttpRequest();
        xhr.onerror = function onError(ev) {
          console.log("XHR Error", ev);
          Notification.show(`Tag could not be removed.`, "error", 4000);
        }
        xhr.onload = function onLoad(ev) {
          if (xhr.status < 300) {
            Notification.show(`Tag ${tagName.value} was removed`, "success", 4000);
            tagName.value = "";
          } else {
            Notification.show(`Tag could not be removed. ${JSON.parse(xhr.response).message}`, "error", 4000);
          }
        }
        xhr.open('PATCH', `/tags`);
        xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
        xhr.send(JSON.stringify(body));
      }
    })


    let selection = new Set<string>();
    for(let i = 0; i < form.length; i++){
      const el = form.elements[i];

      if(!(el instanceof HTMLInputElement) || el.type !== "checkbox" || el.name != "id") continue;
      if(!el.value){
        console.warn("Input element has no valid value : ", el);
        continue;
      }
      sceneCount++;
      if(el.checked) selection.add(el.value);
      el.addEventListener("change", ()=>{
        let _s = new Set(this.selection);
        if(el.checked){
          _s.add(el.value);
          updateButtons();
        }else{
          _s.delete(el.value);
        }
        this.selection = Array.from(_s.values());
        updateButtons();
      });
    }
    this.selection = Array.from(selection.values());
  }

  handleSlotchange = (ev: Event) =>{
    const children = (ev.target as HTMLSlotElement).assignedElements();
    for(let child of children){
      if(!(child instanceof HTMLFormElement)) continue;
      this.registerForm(child);
    }
  }

  protected render(){
    return html`
      <slot @slotchange=${this.handleSlotchange}></slot>
    `;
  }

  /**
   * const form = document.querySelector("#scene-selection");
          if(!form) return console.error(new Error(`Couldn't find scene selection form in document`));
          const dlink = form.querySelector("#selection-download");
          if(!dlink) return console.error(new Error(`selection download button not found : can't set-up scene selection`));
          const selectAll = form.querySelector("#selection-selectAll");
          if(!selectAll) return console.error(new Error(`selectAll button not found : can't set-up scene selection`));
          const deselectAll = form.querySelector("#selection-deselectAll");
          if(!deselectAll) return console.error(new Error(`deselectAll button not found : can't set-up scene selection`));


   */
}
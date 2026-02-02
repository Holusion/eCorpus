
import {notify} from "./notify";


type SelectionEvent = CustomEvent<{selection: string[], total: number}>
type SelectionEventType = "update";

class SelectionManager extends EventTarget{
  #items = new Map<string, HTMLInputElement>();
  #selection = new Set<string>();
  #pending = false;

  public get selected(){
    return this.#selection.size;
  }

  public get size(){
    return this.#items.size;
  }

  #update = ()=>{
    this.dispatchEvent(new CustomEvent("update", { detail: {selection: Array.from(this.#selection), total: this.size }}) satisfies SelectionEvent);

    this.#pending = false;
  }

  /**
   * Typed override of addEventListener that will immediately call its callback
   * @param name 
   * @param cb 
   */
  listen(name: SelectionEventType, cb:(ev:SelectionEvent)=>unknown){
    this.addEventListener(name, cb);
    cb(new CustomEvent(name, { detail: {selection: Array.from(this.#selection), total: this.size }}) satisfies SelectionEvent)
  }

  public requestUpdate(){
    if(this.#pending) return;
    this.#pending = true;
    setTimeout(this.#update, 0);
  }

  /**
   * Marks one or more elements as selected.
   * @param values 
   * @param bubble Propagates the value to the item
   */
  select(_v:string|HTMLInputElement, bubble: boolean = false){
    let _size = this.#selection.size;
    const value = typeof _v === "string"? _v: _v.value; 
    const item = this.#items.get(value);
    if(!item){
      console.warn("Invalid selection value : ", value);
      return;
    }
    if(bubble) item.checked = true;
    console.debug("Select: ", value);
    this.#selection.add(value);
    if(_size != this.#selection.size) this.requestUpdate();
  }
  /**
   * Add all items to selection and checks the HTML elements
   */
  selectAll(){
    let _size = this.#selection.size;
    for(let [value, item] of this.#items.entries()){
      this.#selection.add(value);
      item.checked = true;
    }
    if(_size != this.#selection.size){
      this.requestUpdate();
    }
  }

  delete(id:string, bubble: boolean = false){
    this.requestUpdate();
    if(bubble && this.#items.has(id)) this.#items.get(id).checked = false;
    if(this.#selection.delete(id)){
      this.requestUpdate();
      return true;
    }else{
      return false;
    }
  }

  /**
   * Remove all items from selection and unckecks the item
   */
  clear(){
    let _size = this.#selection.size;
    this.#selection.clear();
    for(const item of this.items()){
      item.checked = false;
    }

    if(_size != 0){
      this.requestUpdate();
    }
  }
  /**
   * Lists selected items
   */
  *[Symbol.iterator](){
    for (const value of this.#selection.values()){
      yield this.#items.get(value);
    }
  }

  /**
   * List all items, selected or not
   */
  items(){
    return this.#items.values();
  }

  #onItemChange =(ev: Event)=>{
    const target = ev.target as HTMLInputElement;
    if(target.checked){
      this.select(target.value);
    }else{
      this.delete(target.value);
    }
  }

  addItem(el: HTMLInputElement){
    if(!el.value?.length) throw new Error("Can't add a checkbox without an ID to the selection manager");
    this.#items.set(el.value, el);
    el.addEventListener("change", this.#onItemChange);
    if(el.checked) this.select(el.value);
  }
}

function registerBatchToggle(toggle: HTMLInputElement, selection: SelectionManager){
   toggle.addEventListener("click", (ev:MouseEvent)=>{
    ev.preventDefault();
    ev.stopPropagation();
    if(selection.selected !== 0){
      console.debug("Clear selection");
      selection.clear();
    }else{
      console.debug("select all");
      selection.selectAll();
    }
  });
  
  selection.listen("update", function onUpdate({detail:{selection, total}}:SelectionEvent){
    toggle.indeterminate = selection.length != 0 && selection.length != total;
    toggle.checked = selection.length == total;
  });

}

function registerDownloadLink(dlink:HTMLAnchorElement, selection: SelectionManager){
  selection.listen("update", ({detail:{selection}})=>{
    if(selection.length == 0){
      dlink.setAttribute("disabled", "");
    }else{
      dlink.removeAttribute("disabled");
    }
    const t = new URL(dlink.href);
    t.searchParams.delete("id");
    for(let id of selection){
      t.searchParams.append("id", id);
    }
    t.searchParams.set("limit", selection.length.toString(10));
    dlink.href = t.toString();
  });
}


/**
 * Wire-up a scene card for two things:
 * - register the selection toggle with the manager
 * - When selection is not empty, allow the whole thumbnail to be used as a selection toggle
 * 
 * @param card 
 * @param selection 
 */
function registerSceneCard(card: HTMLElement, selection: SelectionManager){
  const el = card.querySelector<HTMLInputElement>(`input[type="checkbox"][name="id"]`);
  if(!el) console.warn("Scene card has no input toggle", card);
  else selection.addItem(el);

  card.addEventListener("click", (ev:MouseEvent)=>{
    if(selection.selected == 0) return;
    if(!(ev.target instanceof HTMLImageElement)) return;
    ev.preventDefault();
    ev.stopPropagation();
    if(el.checked){
      selection.delete(el.value, true);
    }else{
      selection.select(el, true);
    }
  })
}


interface BatchTagElements{
  tagName: HTMLInputElement;
  addTag: HTMLElement;
  removeTag: HTMLElement;
}

function registerBatchTag({tagName, addTag, removeTag}:BatchTagElements, selection: SelectionManager){

  function act(action:"create"|"delete"){
    const body: { name: string, scene: number, action: "create" | "delete" }[] = [...selection].map(
      (item) => { return { name: tagName.value, scene: parseInt(item.value), action: "delete" } });

    fetch("../../tags", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
      }
    }).then((response) => {
      if (!response.ok) {
        notify(`Tag could not be deleted. ${response.statusText}`, "error", 4000);
      } else {
        notify(`Tag ${tagName.value} was deleted`, "success", 4000);
        tagName.value = "";
      }
    }, (e) => {
      console.log("Error", e);
      notify(`Tag could not be deleted.`, "error", 4000);
    });
  }

  addTag.addEventListener("click", function onAdd(ev: MouseEvent){
    ev.preventDefault();
    if (tagName.value.length > 0) {
      const body: { name: string, scene: number, action: "create" | "delete" }[] = [...selection].map(
        (scene) => { return { name: tagName.value, scene: parseInt(scene as any), action: "create" } }
      );
      const req = new Request("../../tags", {
        method: "PATCH",
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json;charset=UTF-8",
        }
      })
      window.fetch(req).then((response) => {
        if (!response.ok) {
          notify(`Tag could not be added. ${(response.json())}`, "error", 4000);
        } else {
          notify(`Tag ${tagName.value} was added`, "success", 4000);
          tagName.value = "";
        }
      }).catch((e) => {
        console.log("Error", e);
        notify(`Tag could not be added.`, "error", 4000);
      }
      )
    }
  });

  removeTag.addEventListener("click", function onRemove(ev: MouseEvent){
    ev.preventDefault();
    if (tagName.value.length > 0) {

    }
  })
}




// Bootstrap
(function registerSearchTools(){

  const selection = new SelectionManager();

  const form = document.querySelector("#scenes-selection");
  if(!form) throw new Error("No form matching #scenes-selection found on this page");
  if(!(form instanceof HTMLFormElement)) throw new Error("Matched element is not a form");
  //registerForm(form, selection);

  for(const card of document.querySelectorAll<HTMLElement>(".scene-card[id|=scene]")){
    registerSceneCard(card, selection);
  }

  const batchToggle = document.querySelector<HTMLInputElement>("#scenes-batch-selection");
  if(!batchToggle) console.warn("No select-all toggle matched");
  else registerBatchToggle(batchToggle, selection);

  const dlink = form.querySelector<HTMLAnchorElement>("#selection-download");
  if(!dlink)console.warn(`Form has no download button`, form);
  else registerDownloadLink(dlink, selection);


  const tagName = form.querySelector<HTMLInputElement>("#tag-name");
  const addTag = form.querySelector<HTMLElement>("#add-tag");
  const removeTag = form.querySelector<HTMLElement>("#remove-tag");

  if(!tagName || !addTag || !removeTag) console.warn("Couldn't register batch tag widget");
  else registerBatchTag({tagName, addTag, removeTag}, selection);

})();
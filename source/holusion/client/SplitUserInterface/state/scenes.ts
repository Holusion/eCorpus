import { LitElement, property, Constructor } from "lit-element";
import Notification from "@ff/ui/Notification";

import {HTTPError} from "./errors";
import { disconnect } from "process";

export interface IDocumentParams
{
  name:string;
  root:string;
  title:string;
  thumb:string;
  caption?:string;
}



export declare class ScenesConsumer{
  scenes :Array<IDocumentParams>;
  updateScenes():Promise<void>;
}

export declare class ScenesProvider extends ScenesConsumer{
  error :Error|HTTPError|null;
}



const fetchScenes = (function(){
  let state :{error:Error|HTTPError|null, scenes :Array<IDocumentParams>} = {
    error: null,
    scenes: [],
  };
  let lock = new AbortController();


  let listeners :Set<ScenesConsumer> = new Set();
  function dispatch(next:Array<IDocumentParams>){
    state.scenes = next;
    for(let listener of listeners){
      listener.scenes = state.scenes;
    }
    dispatchError(null);
  }

  let errorListeners :Set<ScenesProvider> = new Set();
  function dispatchError(next :Error|null){
    if(!state.error && !next) return;
    state.error = next;
    if(errorListeners.size === 0){
      console.error("Scenes update error and no one was listening : ", next);
    }
    for(let listener of errorListeners){
      listener.error = state.error;
    }
  }


  return {
    connect(el :ScenesConsumer|ScenesProvider){
      el.scenes = state.scenes;
      listeners.add(el);
      if("error" in el) errorListeners.add(el);
    },
    disconnect(el :ScenesConsumer|ScenesProvider){
      listeners.delete(el);
      if("error" in el) errorListeners.delete(el);
    },
    update() :Promise<void>{
      if(errorListeners.size == 0) throw new Error("No registered scenes provider");
      lock.abort();
      let _c = lock = new AbortController();
      let p = (async ()=>{
        if(_c.signal.aborted) return; //Batch updates within the same frame
        let res = await fetch("/documents.json",{signal: _c.signal});
        if(!res.ok) throw await HTTPError.fromResponse(res);
        let body = await res.json();
        if(!Array.isArray(body.documents) || body.documents.length == 0)throw new Error(`Bad documents list : `+ body);
        dispatch(body.documents);
      })()
      p.catch(dispatchError);
      return p;
    }
  }
})();

export function withScenes<T extends Constructor<LitElement>>(baseClass:T) : T & Constructor<ScenesConsumer> {

  class ScenesConsumer extends baseClass{
    @property({type:Array, attribute: false})
    scenes :Array<IDocumentParams>;


    connectedCallback(): void {
      super.connectedCallback();
      fetchScenes.connect(this);
    }
    disconnectedCallback(): void {
      super.disconnectedCallback();
      fetchScenes.disconnect(this); 
    }

    async updateScenes(){
      await fetchScenes.update();
    }
    
  }
  return ScenesConsumer;
}

export function provideScenes<T extends Constructor<LitElement>>(baseClass:T) : T & Constructor<ScenesProvider> {

  class ScenesProvider extends withScenes(baseClass){
    @property({attribute: false, type: Object})
    error :Error|HTTPError|null = null;
  }
  return ScenesProvider;
}

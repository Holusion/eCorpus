import { LitElement, property, Constructor } from "lit-element";

export declare class BusyConsumer{
  run<T>(fn :()=>Promise<T>):Promise<T>;
}

export declare class BusyProvider extends BusyConsumer{
  isBusy:boolean;
}


interface BusyEvent extends CustomEvent
{
    type: "busy";
    detail: {
      id :string;
      resolve:Promise<void>;
    }
}


export function withBusy<T extends Constructor<LitElement>>(baseClass:T) : T & Constructor<BusyConsumer> {

  class BusyConsumer extends baseClass{
    async run <T>(fn :()=>Promise<T>):Promise<T>{
      let id :string = Math.random().toString(36).split(".")[1].slice(0, 6).padStart(6, "0");
      return new Promise((resolve, reject)=>{
        this.dispatchEvent(new CustomEvent("busy", {detail: {
          id, 
          resolve: new Promise((final)=>{
            Promise.resolve().then(fn)
            .then(resolve, reject)
            .finally(final as any)
          })
        }, bubbles: true}));
      });
    }
  }
  return BusyConsumer;
}

export function provideBusy<T extends Constructor<LitElement>>(baseClass:T) : T & Constructor<BusyProvider> {

  class BusyProvider extends withBusy(baseClass){
    #busy :Set<string> = new Set();

    @property({type: Boolean})
    isBusy:boolean = false;

    #onBusy = (ev :Event|BusyEvent) => {
      ev.stopPropagation();
      if(!("detail" in ev)) return;
      console.log("Busy : ", ev.detail);
      this.#busy.add(ev.detail.id);
      this.isBusy = true;
      ev.detail.resolve.then(()=>{
        this.#busy.delete(ev.detail.id);
        this.isBusy = this.#busy.size != 0;
      });
    }

    connectedCallback(): void {
      super.connectedCallback();
      this.addEventListener("busy", this.#onBusy);
    }
    disconnectedCallback(): void {
      this.removeEventListener("busy", this.#onBusy);
    }
  }
  return BusyProvider;
}

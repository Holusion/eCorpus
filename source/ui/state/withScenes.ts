
import { Constructor, LitElement, property } from "lit-element";
import Notification from "../composants/Notification";

export interface Scene {
  /**ISO date string */
  ctime :string;
  /**ISO date string */
  mtime :string;
  author_id :number;
  author :string;
  id :number;
  name :string;
  thumb ?:string;
  access: {
    user ?:AccessType,
    any :AccessType,
    default :AccessType,
  }
}

export interface ApiResult {
  scenes :Scene[];
}

export const AccessTypes = [
  null,
  "none",
  "read",
  "write",
  "admin"
] as const;

export type AccessType = null|"none"|"read"|"write"|"admin";

export const sorts = ["mtime", "name", "ctime"] as const;
export type OrderBy = typeof sorts[number];

export const directions = ["desc", "asc"] as const;
export type OrderDirection = typeof directions[number];


export declare class SceneView{
  list : Scene[];
  access ?:Array<AccessType>;
  match ?:string;
  orderBy :OrderBy;
  orderDirection :OrderDirection;
  fetchScenes():Promise<void>;
}

export function withScenes<T extends Constructor<LitElement>>(baseClass:T) : T & Constructor<SceneView> {
  class SceneView extends baseClass{
    @property()
    list : Scene[];
    
    #loading = new AbortController();

    access ?:Array<AccessType>;

    @property({type: String, reflect: true})
    match ?:string;

    @property({type: String, reflect: true})
    orderBy :OrderBy = sorts[0];

    @property({type: String, reflect: true})
    orderDirection :OrderDirection = directions[0];
 
    public connectedCallback(): void {
        super.connectedCallback();
        this.fetchScenes();
    }

    protected update(changedProperties: Map<string | number | symbol, unknown>): void {
      if(changedProperties.has("orderBy")){
        this.orderDirection = (this.orderBy === "name" ? "asc" : "desc");
      }
      
      if(changedProperties.has("orderBy") || changedProperties.has("match") || changedProperties.has("orderDirection")){
          this.list = null;
          this.fetchScenes();
      }

      super.update(changedProperties);
  }


    async fetchScenes(){
      this.#loading.abort();
      this.#loading = new AbortController();

      let url = new URL("/api/v1/scenes", window.location.href);
      url.searchParams.set("orderBy", this.orderBy);
      url.searchParams.set("orderDirection", this.orderDirection);

      if(this.match) url.searchParams.set("match", this.match);
      if(this.access?.length) this.access.forEach(a=>url.searchParams.append("access", a));

      url.searchParams.set("limit", "100");
      fetch(url, {signal: this.#loading.signal}).then(async (r)=>{
          if(!r.ok) throw new Error(`[${r.status}]: ${r.statusText}`);
          this.list = ((await r.json()) as ApiResult).scenes;
      }).catch((e)=> {
          if(e.name == "AbortError") return;
          Notification.show(`Failed to fetch scenes list : ${e.message}`, "error");
      });
    }
  }
  return SceneView;
}
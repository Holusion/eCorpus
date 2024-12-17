
import { IDocumentAsset, ICamera, ILight, Matrix4, Quaternion, Vector3 } from "../../schema/document.js";
import { IArticle, IAudioClip, IImage, IMeta } from "../../schema/meta.js";
import { IAnnotation, IAsset, IDerivative, IModel, TUnitType } from "../../schema/model.js";
import { ISetup, ITour, ITourStep } from "../../schema/setup.js";
import { Dictionary, Index } from "../../schema/types.js";
import uid from "../../uid.js";


/**
 * Special symbol to track original index within an array
 * We lie about its type to simplify usage as an indexed value
 */
export const SOURCE_INDEX :"_SOURCE_INDEX" = Symbol("_SOURCE_INDEX") as any;

export interface Indexed{
  [SOURCE_INDEX]: number;
}
/**
 * Inserts an index as a hidden Symbol property in an object
 * Since it's a symbol it will never appear in `Object.keys()` or `for .. in` loops.
 * It's enumerable so it can be obtained through `Object.assign` or Object spread.
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Enumerability_and_ownership_of_properties#traversing_object_properties
 * @param obj obj to insert an index into
 * @param index 
 * @returns 
 */
export function withIndex<T extends {}>(obj :T, index: number):Indexed&T{
  return Object.defineProperty<T>(obj, SOURCE_INDEX, {
    configurable: true, //May be deleted
    enumerable: true,
    value: index
  }) as Indexed&T;
}

/**
 * Special symbol to mark a field for deletion in a diff object
 */
export const DELETE_KEY = Symbol("_DELETE_KEY");


export type Diff<T extends Record<string, any>> = {
  [K in keyof T]?: 
    | typeof DELETE_KEY
    | Diff<T[K]>
    | T[K]
    | Record<number, any>
    |  (K extends keyof T ? number : never);
};

/**
 * IScene where all indexed references were replaced by pointers to the actual objects.
 */
export interface DerefScene{
  name?: string;
  nodes: IdMap<DerefNode>;
  setup?: DerefSetup;
  meta?: DerefMeta;
  units: TUnitType;
}

/**
 * INode where all indexed references were replaced by pointers to the actual objects.
 */
export interface DerefNode {
  id: string; //ID is optional because it does not exist on old scenes
  name?: string;
  children?: IdMap<DerefNode>;

  matrix?: Matrix4;
  translation?: Vector3;
  rotation?: Quaternion;
  scale?: Vector3;
  
  camera?: DerefCamera;
  light?: DerefLight
  model?: DerefModel;
  meta?: DerefMeta;
}

export interface DerefTour{
  id?: string; //ID is optional because it does not exist on old scenes
  title: string;
  titles?: Dictionary<string>;
  //Tour steps are indirectly linked to Setup.snapshots through their ID.
  //This linkage is not dereferenced because there is no known case where it needs to be.
  steps: IdMap<ITourStep>;
  lead?: string;
  leads?: Dictionary<string>;
  //Unimportant properties are kept as arrays
  tags?: string[];
  //Unimportant properties are kept as arrays
  taglist?: Dictionary<string[]>;
}

export interface DerefState{
    id: string;
    curve: string;
    duration: number;
    threshold: number;
    values: Record<string, any>;
}

/**
 * A snapshot is a set of states that can be restored to the scene.
 * It is quite tricky because everything is an array and the order of the states is important.
 * Moreover, the keys in `snapshots.targets` depends on nodes order among other things.
 */
export interface DerefSnapshots{
  features: string[];
  targets :Record<string, Record<string, true>>;
  states: IdMap<DerefState>;
}

export interface DerefMeta extends Omit<IMeta, "images"|"articles"|"audio"|"leadArticle"> {    
  images?: UriMap<IImage>;
  articles?: IdMap<IArticle>;
  audio?: IdMap<IAudioClip>;
  leadArticle?: string;
}

export interface DerefTour extends Omit<ITour, "steps">{
  steps: IdMap<ITourStep>;
}

export interface DerefSetup extends Omit<ISetup,"tours"|"snapshots">{
    tours?: IdMap<DerefTour & {id:string}>;
    snapshots?: DerefSnapshots;
}

export interface DerefModel extends Indexed, Omit<IModel,"derivatives"|"annotations">{
  [SOURCE_INDEX]: number;
  derivatives: AbstractMap<DerefDerivative>;
  annotations?: IdMap<IAnnotation>;
}

export type DerefLight = Indexed & ILight;

export type DerefCamera = Indexed & ICamera;

export interface DerefDerivative extends Omit<IDerivative, "assets">{
    assets: UriMap<IAsset>;
}

////////
// Maps are replacing arrays of identified nodes with a map-by-id

export type AbstractMap<T> = {
  [id: string]: Indexed & T;
}


type MappableType = {id:string} | {uri:string} | {name?:string};

export type IdMap<T extends MappableType> = AbstractMap<T>;

export function toIdMap<T extends MappableType>(arr :T[]) :IdMap<T>{
  const map = {} as IdMap<T>;
  for(let [index, item] of arr.entries()){
    const id :string = (item as any).id || (item as any).uri || (item as any).name || uid();
    map[id] = withIndex(item, index);
  }
  return map;
}


export type NameMap<T extends {name :string}> = IdMap<T>;

export function toNameMap<T extends {name:string}>(arr :T[]) :NameMap<T>{
  const map = {} as NameMap<T>;
  for(let [index, item] of arr.entries()){
    map[item.name] = withIndex(item, index);
  }
  return map;
}

export type UriMap<T extends {uri :string}> = IdMap<T>;

export function toUriMap<T extends {uri:string}>(arr :T[]) :UriMap<T>{
  const map = {} as UriMap<T>;
  for(let [index, item] of arr.entries()){
    map[item.uri] = withIndex(item, index);
  }
  return map;
}

export function fromMap<T extends MappableType>(map :IdMap<T>):T[]
export function fromMap<T>(map :AbstractMap<T>):T[]
export function fromMap<T>(map :AbstractMap<T>):T[]{
  return restoreIndex(Object.values(map));
}

/** Sort an array of symbol-indexed items to restore their initial order */
export function restoreIndex<T>(src: Array<T & Indexed>):Array<T>{
  return src.sort((a, b)=>a[SOURCE_INDEX] -b[SOURCE_INDEX]).map((item: T & Indexed)=>{
    delete (item as T & Partial<Indexed>)[SOURCE_INDEX];
    return item as T;
  });
}

/**
 * A document where all indexed references were replaced by pointers to the actual objects.
 * @see DerefNode for nodes
 * @see DerefScene for scenes
 */
export interface DerefDocument
{
    asset: IDocumentAsset;
    scene: DerefScene;
}

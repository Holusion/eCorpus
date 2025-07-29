import { ICamera, IDocument, ILight, INode, IScene } from "../../schema/document.js";
import { IMeta } from "../../schema/meta.js";
import { IModel } from "../../schema/model.js";
import { ISetup } from "../../schema/setup.js";
import { mapMeta } from "./meta.js";
import { mapModel } from "./model.js";
import { appendScene, mapScene } from "./scene.js";
import { mapSetup } from "./setup.js";
import { DerefDocument, DerefScene } from "./types.js";
import { mapNodes } from './node.js';




/**
 * Takes a dereferenced document and computes back the source svx.json document.
 * It's akin to the `toDocument()`methods seen in DPO-voyager, in particular in `CVScene.ts`.
 * @see toPointers for the inverse operation
 */
export function fromPointers({asset, scene} :Partial<DerefDocument>): IDocument{

  //The output document.
  // All fields are initially created to later filter unused ones
  let document :Required<IDocument> = {
    asset: asset as any,
    scene: undefined as any,
    "scenes": [] as IScene[],
    "nodes": [] as INode[],
    "cameras": [] as ICamera[],
    "lights": [] as ILight[],
    "models": [] as IModel[],
    "metas": [] as IMeta[],
    "setups": [] as ISetup[],
  };



  if(scene) document.scene = appendScene(document, scene);

  return cleanDocument(document);
}

/**
 * Clean up a document by removing empty collections
 * The document object will get mutated in-place and is returned for good measure
 * @param document 
 * @returns 
 */
function cleanDocument(document :Required<IDocument>) :IDocument{
  //Remove empty collections
  for(let key in document){
    let v = document[key as keyof typeof document];
    if(typeof v === "undefined" || (Array.isArray(v) && v.length == 0)) delete document[key as keyof typeof document];
  }
  return document;
}


/**
 * Dereference all indexed values into pointers in a SVX document
 * It unlinks all unreachable nodes (scenes, setups, etc...).
 * 
 * Where possible, arrays are converted to dictionaries
 * indexed by any unique property their items might have (typ. `name`, `id` or `uri`).
 * 
 * 
 * It's something of an emulation of what DPO-voyager does when building a scene graph from a document.
 * See [CVScene.ts](https://github.com/Smithsonian/dpo-voyager/blob/master/source/client/components/CVScene.ts) 
 * and [CVNode.ts](https://github.com/Smithsonian/dpo-voyager/blob/master/source/client/components/CVNode.ts) in voyager.
 * 
 * @fixme should be simplified by exporting most of its code into separate functions, like in `fromPointers()`
 */
export function toPointers(src :Readonly<IDocument>) :DerefDocument {
  if(!src) throw new Error(`Can't dereference invalid document ${src}`);
  // Dereference self-contained collections
  const metas = src.metas?.map(mapMeta) ?? [];
  const models = src.models?.map(mapModel)?? [];

  // nodes and scenes mapping couldn't be made side-effect-free because they map to other collections
  const nodes = src.nodes? mapNodes(src.nodes, {metas, models, cameras: src.cameras, lights: src.lights}):undefined;

  const setups = src.setups?.map(s=>mapSetup(s, nodes ??[])) ?? [];

  if(!Array.isArray(src.scenes) || !src.scenes.length) throw new Error("Document has no valid scene");
  if(typeof src.scene != "number"|| !src.scenes[src.scene]) throw new Error(`Document's scene #${src.scene} is invalid`);
  const iScene = src.scenes[src.scene];

  const scene :DerefScene = mapScene(iScene, {nodes, metas, setups});


  return {
    asset: src.asset,
    scene,
  };
}
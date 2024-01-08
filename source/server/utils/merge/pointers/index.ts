
import { ICamera, IDocument, ILight, INode, IScene } from "../../schema/document.js";
import { IMeta } from "../../schema/meta.js";
import { IModel } from "../../schema/model.js";
import { ISetup } from "../../schema/setup.js";
import uid from "../../uid.js";
import { mapMeta } from "./meta.js";
import { mapModel } from "./model.js";
import { appendScene } from "./scene.js";
import { mapSetup } from "./setup.js";
import { DerefDocument, DerefMeta, DerefNode, DerefScene, DerefSetup, SOURCE_INDEX } from "./types.js";




/**
 * Takes a dereferenced document and computes back the source svx.json document.
 * It's akin to the `toDocument()`methods seen in DPO-voyager, in particular in `CVScene.ts`.
 * @see toPointers for the inverse operation
 */
export function fromPointers({asset, scene} :DerefDocument): IDocument{

  //The output document.
  // All fields are initially created to later filter unused ones
  let document :Required<IDocument> = {
    asset,
    scene: -1,
    "scenes": [] as IScene[],
    "nodes": [] as INode[],
    "cameras": [] as ICamera[],
    "lights": [] as ILight[],
    "models": [] as IModel[],
    "metas": [] as IMeta[],
    "setups": [] as ISetup[],
  };



  document.scene = appendScene(document, scene);

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
export function toPointers(src :IDocument) :DerefDocument {

  // Dereference self-contained collections
  const metas = src.metas?.map(mapMeta) ?? [];
  const models = src.models?.map(mapModel)?? [];

  // nodes and scenes mapping couldn't be made side-effect-free because they map to other collections
  
  //Dereference every node's internal properties
  const nodes = src.nodes?.map((iNode, nodeIndex)=>{
    if(!iNode.id) console.log("Node #%d has no id : ", nodeIndex, iNode);
    let node :DerefNode = {
      id: iNode.id ?? nodeIndex.toString(),
      name: iNode.name  ?? uid(),
      matrix: iNode.matrix,
      translation: iNode.translation,
      rotation: iNode.rotation,
      scale: iNode.scale,
    };

    if(typeof iNode.meta === "number"){
      node.meta = metas[iNode.meta];
      if(!node.meta) throw new Error(`Invalid meta index ${iNode.meta} in node #${nodeIndex}`);
    }

    if(typeof iNode.model === "number"){
      node.model = models[iNode.model];
      if(!node.model) throw new Error(`Invalid model index ${iNode.model} in node #${nodeIndex}`);
    }

    if(typeof iNode.camera === "number"){
      let ptr = src.cameras?.[iNode.camera];
      if(!ptr) throw new Error(`Invalid camera index ${iNode.camera} in node #${nodeIndex}`);
      node.camera = {...ptr, [SOURCE_INDEX]: iNode.camera};
    }

    if(typeof iNode.light === "number"){
      let ptr = src.lights?.[iNode.light];
      if(!ptr) throw new Error(`Invalid light index ${iNode.light} in node #${nodeIndex}`);
      node.light = {...ptr, [SOURCE_INDEX]: iNode.light};
    }

    //node.children will be assigned later, because children might not have been dereferenced yet

    return node;
  });
  //Dereference node children.
  //We don't need recursion because doc.nodes is a flat list
  nodes?.forEach((node, nodeIndex)=>{
    const indices = (src.nodes as INode[])[nodeIndex].children;
    if(!indices) return;
    node.children = indices.reduce((children, idx)=>{
      let node = nodes[idx];
      return {...children, [node.id]: node}
    }, {});
  });




  if(!Array.isArray(src.scenes) || !src.scenes.length) throw new Error("Document has no valid scene");
  if(typeof src.scene != "number"|| !src.scenes[src.scene]) throw new Error(`Document's scene #${src.scene} is invalid`);
  const iScene = src.scenes[src.scene];

  const scene :DerefScene = {
    name: iScene.name,
    units: iScene.units,
    nodes: {},
  }

  if(iScene.nodes?.length){
    scene.nodes = iScene.nodes.reduce((children, idx)=>{
      const node = nodes?.[idx]
      if(!node) throw new Error(`Invalid node index ${idx} in scene #${src.scene}`);
      return {...children, [node.id]: node};
    }, {});
  }


  if(typeof iScene.meta == "number"){
    if(!src.metas || !src.metas[iScene.meta]) throw new Error(`Invalid meta #${iScene.meta} in scene #${src.scene}`)
    scene.meta = metas[iScene.meta];
  }

  const setups = src.setups?.map(s=>mapSetup(s, nodes ??[])) ?? [];
  if(typeof iScene.setup == "number"){
    if(!src.setups || !src.setups[iScene.setup]) throw new Error(`Invalid setup #${iScene.setup} in scene #${src.scene}`)
    scene.setup = setups[iScene.setup];
  }

  return {
    asset: src.asset,
    scene,
  };
}
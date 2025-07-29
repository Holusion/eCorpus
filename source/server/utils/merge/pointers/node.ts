import {debuglog} from 'node:util';
import { ICamera, IDocument, ILight, INode } from "../../schema/document.js";
import { appendMeta } from "./meta.js";
import { appendModel } from "./model.js";
import { DerefMeta, DerefModel, DerefNode, SOURCE_INDEX } from "./types.js";

const debug = debuglog("merge");

export function appendNode(document :Required<IDocument>, {id, meta, model, camera, light, children, ...node} :DerefNode){

  let iNode :INode = {id};

  for(let key in node){
    if(typeof (node as any)[key] === "undefined") continue;
    (iNode as any)[key] = (node as any)[key];
  }

  //Push to collection before appending children because that's a more "natural" order to have
  const idx = document.nodes.push(iNode) - 1;

  if(meta){
    iNode.meta = appendMeta(document, meta);
  }

  if(model){
    iNode.model = appendModel(document, model);
  }

  if(camera){
    const {[SOURCE_INDEX]:src_index, ...camProps} = camera;
    iNode["camera"] = document["cameras"].push(camProps) -1;
  }
  if(light){
    const {[SOURCE_INDEX]:src_index, ...lightProps} = light;
    iNode["light"] = document["lights"].push(lightProps) -1;
  }

  const _children = Object.values(children ?? {});
  if(_children.length){
    iNode.children = _children.map((child)=>appendNode(document, child));
  }

  return idx;
}


interface NodePointersDict{
  metas: DerefMeta[];
  models: DerefModel[];
  cameras?: ICamera[];
  lights?: ILight[];
}

export function mapNodes(iNodes :Readonly<INode>[], dicts: Readonly<NodePointersDict>) :DerefNode[]|undefined{
  const nodes = iNodes.map((iNode, nodeIndex)=>{
      if(!iNode.id) debug(`Node #${ nodeIndex} has no id : `, iNode);
      try{
        return mapNode(iNode, dicts);
      }catch(e: any){
        throw new Error(`in node ${iNode.id ?? nodeIndex} ${e.message}`);
      }
  });

  //Dereference node children.
  //We don't need recursion because doc.nodes is a flat list
  return nodes?.map((node, nodeIndex)=>{
    const indices = (nodes as INode[])[nodeIndex].children;
    if(!indices) return node;
    const children = indices.reduce((children, idx)=>{
      let node = nodes[idx];
      return {...children, [node.id ?? "#"+idx]: node}
    }, {});
    return {...node, children};
  });
}


export function mapNode(iNode: Readonly<INode>, {metas, models, cameras, lights}: Readonly<NodePointersDict>):Omit<DerefNode, "children">{

  let node :Omit<DerefNode, "children"> = {
    ...iNode,
    matrix: iNode.matrix,
    translation: iNode.translation,
    rotation: iNode.rotation,
    scale: iNode.scale,
    meta: undefined,
    model: undefined,
    camera: undefined,
    light: undefined
  };

  if(typeof iNode.meta === "number"){
    node.meta = metas[iNode.meta];
    if(!node.meta) throw new Error(`Invalid meta index ${iNode.meta}`);
  }

  if(typeof iNode.model === "number"){
    node.model = models[iNode.model];
    if(!node.model) throw new Error(`Invalid model index ${iNode.model}`);
  }

  if(typeof iNode.camera === "number"){
    let ptr = cameras?.[iNode.camera];
    if(!ptr) throw new Error(`Invalid camera index ${iNode.camera}`);
    node.camera = {...ptr, [SOURCE_INDEX]: iNode.camera};
  }

  if(typeof iNode.light === "number"){
    let ptr = lights?.[iNode.light];
    if(!ptr) throw new Error(`Invalid light index ${iNode.light}`);
    node.light = {...ptr, [SOURCE_INDEX]: iNode.light};
  }

  //node.children will be assigned later, because children might not have been dereferenced yet

  return node;
}
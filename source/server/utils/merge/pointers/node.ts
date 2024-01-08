import { IDocument, INode } from "../../schema/document.js";
import { appendMeta } from "./meta.js";
import { appendModel } from "./model.js";
import { DerefNode, SOURCE_INDEX } from "./types.js";


export function appendNode(document :Required<IDocument>, node :DerefNode){

  let iNode :INode = {id: node.id};

  //Push to collection before appending children because that's a more "natural" order to have
  const idx = document.nodes.push(iNode) - 1;

  if(node.name) iNode.name = node.name;

  if(node.matrix) iNode.matrix = node.matrix;
  if(node.translation) iNode.translation = node.translation;
  if(node.rotation) iNode.rotation = node.rotation;
  if(node.scale) iNode.scale = node.scale;

  if(node.meta){
    iNode.meta = appendMeta(document, node.meta);
  }

  if(node.model){
    iNode.model = appendModel(document, node.model);
  }

  if(node.camera){
    const {[SOURCE_INDEX]:src_index, ...camera} = node.camera;
    iNode["camera"] = document["cameras"].push(camera) -1;
  }
  if(node.light){
    const {[SOURCE_INDEX]:src_index, ...light} = node.light;
    iNode["light"] = document["lights"].push(light) -1;
  }


  const children = Object.values(node.children ?? {});
  if(children.length){
    iNode.children = children.map((child)=>appendNode(document, child));
  }

  return idx;
}

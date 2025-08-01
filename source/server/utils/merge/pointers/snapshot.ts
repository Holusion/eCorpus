import { INode } from "../../schema/document.js";
import { DerefNode, SOURCE_INDEX } from "./types.js";

/**
 * changes a snapshot target by replacing indices with ids where possible
 * @returns 
 */
export function mapTarget(target :string, nodes :DerefNode[]){
  const [root, indexString, ...propPath] = target.split("/");
  const index = parseInt(indexString);
  if(Number.isNaN(index)) return target;

  if(root=='scenes'){
    return target; //Scene index is not expected to change
  }
  
  let node :DerefNode | undefined;

  if(root == "node"){
    node = nodes[index];
  }else if(root == "model"){
    node = nodes.find(n=>n.model?.[SOURCE_INDEX] === index);
  } if(root == "light"){
    node = nodes.find(n=>n.light?.[SOURCE_INDEX] === index);
  }

  if(!node) throw new Error(`Invalid pathMap: ${target} does not point to a valid ${root} index`);
  return `${root}/${node.id}/${propPath.join("/")}`;
}


export function unmapTarget(target :string, nodes :INode[]){
  const [root, id, ...propPath] = target.split("/");

  if(root=='scenes'){
    return target; //Scene index is not expected to change
  }

  let index :number|undefined;
  let nodeIndex: number;
  
  if(id.startsWith("#")){
    nodeIndex = parseInt(id.slice(1));
    if(!Number.isInteger(nodeIndex) || (typeof nodes[nodeIndex] === "undefined")) throw new Error(`Invalid node index : ${id.slice(1)}`);
  }else{
    nodeIndex = nodes.findIndex(n=>n.id === id);
    if(nodeIndex === -1) throw new Error(`can't find node with id : ${id} (in ${target})`);
  }
  
  if(root == "node"){
    index = nodeIndex;
  }else if(root == "model"){
    index = nodes[nodeIndex].model;
  } if(root == "light"){
    index = nodes[nodeIndex].light;
  }
  if(typeof index !== "number") throw new Error(`Invalid pathMap: ${target} does not point to a valid ${root} reference`);
  return `${root}/${index}/${propPath.join("/")}`;
}
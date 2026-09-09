import { INode } from "../../schema/document.js";
import { DerefNode, SOURCE_INDEX } from "./types.js";

/**
 * changes a snapshot target by replacing indices with ids where possible
 *
 * Nodes carry no `id` in documents made before ids existed. Those fall back to the
 * `#<node index>` form, which {@link unmapTarget} understands, rather than interpolating
 * `undefined` into the target and making it unresolvable on the way back.
 * @returns the dereferenced target, or `undefined` if it points to nothing
 */
export function mapTarget(target :string, nodes :DerefNode[]) :string|undefined{
  const [root, indexString, ...propPath] = target.split("/");
  const index = parseInt(indexString);
  if(Number.isNaN(index)) return target;

  if(root=='scenes'){
    return target; //Scene index is not expected to change
  }

  //Snapshots address models and lights through the node that holds them, so every root
  //resolves to a node index first.
  let nodeIndex :number;
  if(root == "node"){
    nodeIndex = index;
  }else if(root == "model"){
    nodeIndex = nodes.findIndex(n=>n.model?.[SOURCE_INDEX] === index);
  }else if(root == "light"){
    nodeIndex = nodes.findIndex(n=>n.light?.[SOURCE_INDEX] === index);
  }else{
    return target; //Unknown root: leave it alone rather than mangle it
  }

  const node :DerefNode|undefined = nodes[nodeIndex];
  if(!node) return undefined;
  return `${root}/${node.id ?? "#"+nodeIndex}/${propPath.join("/")}`;
}

/**
 * Inverse of {@link mapTarget}: puts back the indices a document uses.
 * @returns the referenced target, or `undefined` if it points to nothing. A target can
 * become unresolvable when the node it names was removed, typically by a merge, and
 * dropping it is preferable to failing the whole document.
 */
export function unmapTarget(target :string, nodes :INode[]) :string|undefined{
  const [root, id, ...propPath] = target.split("/");

  if(root=='scenes'){
    return target; //Scene index is not expected to change
  }

  let index :number|undefined;
  let nodeIndex: number;
  
  if(id.startsWith("#")){
    nodeIndex = parseInt(id.slice(1));
    if(!Number.isInteger(nodeIndex) || (typeof nodes[nodeIndex] === "undefined")) return undefined;
  }else{
    nodeIndex = nodes.findIndex(n=>n.id === id);
    if(nodeIndex === -1) return undefined;
  }
  
  if(root == "node"){
    index = nodeIndex;
  }else if(root == "model"){
    index = nodes[nodeIndex].model;
  }else if(root == "light"){
    index = nodes[nodeIndex].light;
  }else{
    return target; //Unknown root: leave it alone rather than mangle it
  }
  if(typeof index !== "number") return undefined;
  return `${root}/${index}/${propPath.join("/")}`;
}

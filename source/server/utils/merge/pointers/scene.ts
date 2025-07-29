import {  IDocument, IScene } from "../../schema/document.js";
import { appendMeta } from "./meta.js";
import { appendNode } from "./node.js";
import { appendSetup } from "./setup.js";

import { DerefMeta, DerefNode, DerefScene, DerefSetup, fromMap } from "./types.js";



export function appendScene(document :Required<IDocument>, {meta, nodes, setup, ...scene} :DerefScene){
  let iScene :IScene = {
    ...scene,
  };
  if(scene.name) iScene.name = scene.name;



  const _nodes = fromMap(nodes ?? {});
  if(_nodes.length){
    iScene.nodes = _nodes.map((node)=>appendNode(document, node));
  }
  //Order is important
  // meta should be inserted after any child nodes to keep the same order as what voyager does
  if(meta){
    iScene.meta = appendMeta(document, meta);
  }
  // appendSetup relies on nodes being properly inserted.
  if(setup){
    iScene.setup = appendSetup(document, setup);
  }
  
  return document.scenes.push(iScene) - 1;
}

interface ScenePointersDicts{
  nodes?: DerefNode[];
  metas: DerefMeta[];
  setups?: DerefSetup[];
}

export function mapScene({nodes:iNodes, setup: iSetup, meta: iMeta, ...iScene}:IScene, {nodes, metas, setups}: ScenePointersDicts):DerefScene{
  const name = iScene.name ?? "#0";
  const scene :DerefScene = {
    ...iScene,
    nodes: {},
  }

  if(iNodes?.length){
    scene.nodes = iNodes.reduce((children, idx)=>{
      const node = nodes?.[idx]
      if(!node) throw new Error(`Invalid node index ${idx} in scene ${name}`);
      return {...children, [node.id ?? "#"+idx]: node};
    }, {});
  }


  if(typeof iSetup == "number"){
    if(!setups || !setups[iSetup]) throw new Error(`Invalid setup #${iSetup} in scene ${name}`)
    scene.setup = setups[iSetup];
  }

  if(typeof iMeta == "number"){
    if(!metas || !metas[iMeta]) throw new Error(`Invalid meta #${iMeta} in scene ${name}`)
    scene.meta = metas[iMeta];
  }
  return scene;
}
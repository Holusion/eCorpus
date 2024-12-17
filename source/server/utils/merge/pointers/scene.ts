import {  IDocument, IScene } from "../../schema/document.js";
import { appendMeta } from "./meta.js";
import { appendNode } from "./node.js";
import { appendSetup } from "./setup.js";

import { DerefScene, fromMap } from "./types.js";



export function appendScene(document :Required<IDocument>, scene :DerefScene){
  let iScene :IScene = {
    units: scene.units ?? "cm", //This is the default unit as per CVScene.ts
  };
  if(scene.name) iScene.name = scene.name;



  if(scene.meta){
    iScene.meta = appendMeta(document, scene.meta);
  }
  const nodes = fromMap(scene.nodes ?? {});
  if(nodes.length){
    iScene.nodes = nodes.map((node)=>appendNode(document, node));
  }

  //Order is important: appendSetup relies on nodes being properly inserted.
  if(scene.setup){
    iScene.setup = appendSetup(document, scene.setup);
  }
  
  return document.scenes.push(iScene) - 1;
}

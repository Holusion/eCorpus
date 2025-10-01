import path from "path";
import { parse_glb } from "../../utils/glTF.js";
import uid from "../../utils/uid.js";
import { TaskHandlerDefinition, TaskHandlerParams } from "../types.js";
import getDefaultDocument from "../../utils/schema/default.js";
import { IDocument, INode } from "../../utils/schema/document.js";
import { TLanguageType } from "../../utils/schema/common.js";
import { IDerivative, IModel, TDerivativeQuality, TDerivativeUsage } from "../../utils/schema/model.js";


interface AppendModelParams{
  file: string,
  name: string,
  quality?: TDerivativeQuality,
  usage?: TDerivativeUsage,
  index?: number,
  language?: TLanguageType,
  user_id: number,
}

export default async function handleAppendModel({task: {fk_scene_id: scene_id, data}, signal, context:{vfs}}:TaskHandlerParams<AppendModelParams>){
  const scene_name = data.name; 
  const usage = data.usage ?? "Web3D";
  const quality = data.quality ?? "High";
  const index = data.index ?? 0;
  const user_id = data.user_id;
  let meta = await parse_glb(data.file);
  let mesh = meta.meshes[0]; //Take the first mesh for its name
  let derivative: IDerivative = {
    "usage": usage,
    "quality": quality,
    "assets": [
      {
        "uri": `models/${scene_name}.glb`,
        "type": "Model",
        "byteSize": meta.byteSize,
        "numFaces": meta.meshes.reduce((acc, m)=> acc+m.numFaces, 0),
        "imageSize": 8192 /**@fixme should report proper texture sizes for LOD */
      }
    ]
  };
  console.log("Task params", arguments);

  await vfs.isolate(async (vfs)=>{
    let document:ReturnType<typeof getDefaultDocument>;
    try{
      let docFile = await vfs.getDoc(scene_id, true);
      document = JSON.parse(docFile.data);
    }catch(e:any){
      console.log("getDoc error for scene", scene_id, e);
      if(e.code != 404){
        throw e;
      }
      document = getDefaultDocument();
    }

    if(data.language){
      document.setups[0].language = {language: data.language};
    }

    if(typeof document.scenes[document.scene].meta !== "number"){
      document.metas ??= [];
      document.scenes![document.scene!].meta = document.metas.push({
        "collection": {
          "titles": {
            "EN": scene_name,
            "FR": scene_name,
          }
        },
      }) -1;
    }

    if(!document.nodes.find(n=> n.model === index)){
      let node: INode = {
        "id": uid(),
        "name": mesh?.name ?? data.name,
        "model": index,
      }
      document.nodes.push(node);
    };
    document.models ??= [];
    if(!document.models[index]){
      document.models[index] = {
        "units": "m", //glTF specification says it's always meters. It's what blender do.
        "boundingBox": meta.bounds,
        "derivatives":[],
        "annotations":[],
      } satisfies IModel
    }
    const model = document.models[index];
    model.derivatives.push(derivative);

    await vfs.writeDoc(JSON.stringify(document), {
      scene: scene_id,
      user_id,
      name: "scene.svx.json"
    })
  });

};

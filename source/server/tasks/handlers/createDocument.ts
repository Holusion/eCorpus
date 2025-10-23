
import { TaskHandlerParams } from "../types.js";
import getDefaultDocument from "../../utils/schema/default.js";
import { INode } from "../../utils/schema/document.js";
import { TLanguageType } from "../../utils/schema/common.js";
import { IDerivative, IModel, TDerivativeQuality, TDerivativeUsage } from "../../utils/schema/model.js";
import { SceneDescription } from "./glb/inspect.js";


export interface AssetDefinition {
  /** Model id. 
   * Randomly generated uid string.
   * Every derivatives of the same model should share the same id
   */
  id: string,
  filename: string,
  quality: TDerivativeQuality,
  usage: TDerivativeUsage,
  meta: SceneDescription,
  size: number,
}

export interface CreateDocumentParams{
  models: AssetDefinition[];
  name: string,
  language?: TLanguageType,
  user_id: number,
}

function isSceneDescription(meta: any): meta is SceneDescription{

  return meta && typeof meta === "object"
    && "name" in meta
    && meta.bounds && typeof meta.bounds === "object" 
    && Array.isArray(meta.bounds.min) && meta.bounds.min.length == 3 && meta.bounds.min.every((n:number)=>Number.isFinite(n))
    && Array.isArray(meta.bounds.max) && meta.bounds.max.length == 3  && meta.bounds.max.every((n:number)=>Number.isFinite(n))
    && Number.isInteger(meta.imageSize) && 0 <= meta.imageSize
    && Number.isInteger(meta.numFaces) && 0 <= meta.numFaces;
}

function isAssetDefinition(d: any): d is AssetDefinition{
  return typeof d === "object"
    && d != null
    && typeof d.id === "string" 
    && typeof d.filename === "string"
    && ["Thumb", "Low", "Medium", "High", "Highest", "AR"].indexOf(d.quality) !== -1
    && ["Web3D", "App3D", "iOSApp3D"].indexOf(d.usage) !== -1
    && isSceneDescription(d.meta)
    && typeof d.size === "number";
}

export async function createDocument({task: {fk_scene_id: scene_id, data: {models, name, language, user_id}}, context:{vfs, tasks, logger}}:TaskHandlerParams<CreateDocumentParams>){

  if(!Array.isArray(models)) throw new Error(`models is not an array`);
  if(!models.length) throw new Error(`Can't create document from an empty list`);
  let non_model_index = models.findIndex(m=>!isAssetDefinition(m));
  if(non_model_index !== -1){
    logger.error("Invalid asset definition : "+JSON.stringify(models[non_model_index], null, 2));
    throw new Error(`Object at index ${non_model_index} is not an asset definition`);
  }
  logger.debug("Use provided list of %d models", models.length);

  let document = getDefaultDocument();
  if(language){
    document.setups[0].language = {language};
  }

  document.metas = [{
    "collection": {
      "titles": {
        "EN": name,
        "FR": name,
      }
    },
  }];
  document.scenes[document.scene].meta = 0;

  document.models = [];

  for(const {id, filename, quality, usage, meta, size} of models){
    let model_name = meta.name ?? filename.split("/").pop()!.replace(/\.glb$/i, "");
    let node: INode = document.nodes.find(n=> n.id === id) ?? (()=>{
      let model_index = document.models.push({
        "units": "m", //glTF specification says it's always meters. It's what blender do.
        "boundingBox": meta.bounds,
        "derivatives":[],
        "annotations":[],
      } satisfies IModel) -1;
      let node_index = document.nodes.push({
        "id": id,
        "name": model_name,
        "model": model_index,
      }) -1;
      document.scenes[document.scene].nodes?.push(node_index);
      return document.nodes[node_index];
    })();
    
    const model = document.models[node.model!];
    if(!model) throw new Error(`Node ${id} does not point to a valid model in scene document`);
    if(model.derivatives.find(d=>d.quality == quality && d.usage == usage)) throw new Error(`Duplicate derivative ${usage}/${quality} for node ${id} (model #${node.model}) in scene document`)
    
    let derivative: IDerivative = {
      "usage": usage,
      "quality": quality,
      "assets": [
        {
          "uri": filename,
          "type": "Model",
          "byteSize": size,
          "numFaces": meta.numFaces,
          "imageSize": meta.imageSize,
        }
      ],
    };
    model.derivatives.push(derivative);
  }
  /** @fixme sort derivatives? */

  logger.debug(`Create document with models : [${document.nodes.filter(n=>typeof n.model === "number").map(n=>`"${n.name}"`).join(", ")}] (${models.length} assets)`);
  await vfs.writeDoc(JSON.stringify(document), {
    scene: scene_id,
    user_id,
    name: "scene.svx.json",
  });
};

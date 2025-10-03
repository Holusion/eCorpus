import path from "path";
import { parse_glb } from "../../utils/glTF.js";
import uid from "../../utils/uid.js";
import { TaskHandlerDefinition, TaskHandlerParams } from "../types.js";
import getDefaultDocument from "../../utils/schema/default.js";
import { IDocument, INode } from "../../utils/schema/document.js";
import { TLanguageType } from "../../utils/schema/common.js";
import { IDerivative, IModel, TDerivativeQuality, TDerivativeUsage } from "../../utils/schema/model.js";
import { FileProps } from "../../vfs/types.js";


interface DerivativeDefinition {
  /** Model id. 
   * Randomly generated uid string.
   * Every derivatives of the same model should share the same id
   */
  id: string,
  file: Pick<FileProps,"name"|"hash">,
  quality: TDerivativeQuality,
  usage: TDerivativeUsage,
}

interface CreateDocumentParams{
  models: DerivativeDefinition[];
  name: string,
  language?: TLanguageType,
  user_id: number,
}

export async function createDocument({task: {fk_scene_id: scene_id, data: {models, name, language, user_id}}, context:{vfs}}:TaskHandlerParams<CreateDocumentParams>){
  if(!models?.length) throw new Error("Can't create an empty scene: need at least one model");

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
  document.scenes![document.scene!].meta = 0;

  document.models = [];
  for(const {id, file, quality, usage} of models){
    if(!file.hash) throw new Error(`File ${name}/${file.name} does not point to a valid file`);
    let meta = await parse_glb(vfs.filepath(file.hash));
    let mesh = meta.meshes[0]; //Take the first mesh for its name
    let mesh_name = mesh?.name ?? file.name.split("/").pop()!.replace(/\.glb$/i, "");
    let node: INode = document.nodes.find(n=> n.id === id) ?? (()=>{
      let model_index = document.models.push({
        "units": "m", //glTF specification says it's always meters. It's what blender do.
        "boundingBox": meta.bounds,
        "derivatives":[],
        "annotations":[],
      } satisfies IModel) -1;
      let node_index = document.nodes.push({
        "id": id,
        "name": mesh_name,
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
          "uri": file.name,
          "type": "Model",
          "byteSize": meta.byteSize,
          "numFaces": meta.meshes.reduce((acc, m)=> acc+m.numFaces, 0),
          "imageSize": 8192 /**@fixme should report proper texture sizes for LOD */
        }
      ],
    };
    model.derivatives.push(derivative);

  }
  /** @fixme sort derivatives? */

  await vfs.writeDoc(JSON.stringify(document), {
    scene: scene_id,
    user_id,
    name: "scene.svx.json"
  })

};

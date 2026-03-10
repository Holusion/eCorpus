import getDefaultDocument from "../../utils/schema/default.js";
import { IDocument } from "../../utils/schema/document.js";
import { IAsset, IModel, TDerivativeQuality, TDerivativeUsage } from "../../utils/schema/model.js";
import { BoundingBox } from "../../utils/gltf/inspect.js";
import uid from "../../utils/uid.js";
import { TaskHandlerParams } from "../types.js";
import { SceneLanguage } from "../../utils/languages.js";



export interface DocumentModel {
  name?: string;
  /**
   * Uri is slightly misleading as it's "relative to scene root"
   * `uri` **WILL** be urlencoded by {@link createDocumentFromFiles} so it should be given in clear text
   */
  uri: string;
  byteSize: number;
  numFaces: number;
  imageSize: number;
  bounds: BoundingBox | null;
  quality: TDerivativeQuality;
  usage: TDerivativeUsage;
};





export interface GetDocumentParams {
  scene: string;
  models: Array<DocumentModel>;
  language: SceneLanguage | undefined;
}




export async function createDocumentFromFiles(
  {
    task: {
      data: { scene, models, language = "EN" }
    },
  }: TaskHandlerParams<GetDocumentParams>): Promise<IDocument> {

  let document = getDefaultDocument();
  //dumb inefficient Deep copy because we want to mutate the doc in-place
  document.models ??= [];
  for (let model of models) {
    const asset: IAsset = {
      "uri": encodeURIComponent(model.uri),
      "type": "Model",
    };
    for (const k of ["byteSize", "numFaces", "imageSize"] as const) {
      //Ignore values that does not match schema for those properties
      if (!Number.isInteger(model[k]) || model[k] < 1) continue;
      asset[k] = model[k];
    }
    const _m: IModel = {
      "units": "m", //glTF specification says it's always meters. It's what blender do.
      "derivatives": [{
        "usage": model.usage,
        "quality": model.quality,
        "assets": [asset]
      }],
      "annotations": [],
    };
    if (model.bounds
      && Array.isArray(model.bounds.min)
      && Array.isArray(model.bounds.max)
      && model.bounds.min.every(n => Number.isFinite(n))
      && model.bounds.max.every(n => Number.isFinite(n))) {
      _m.boundingBox = model.bounds;
    }
    const index = document.models.push(_m) - 1;
    const nodeIndex = document.nodes.push({
      "id": uid(),
      "name": model.name ?? scene,
      "model": index,
    } as any) - 1;
    document.scenes[0].nodes!.push(nodeIndex);
  }


  document.setups[0].language = { language: language };
  document.metas ??= [];
  const meta_index = document.metas.push({
    "collection": {
      "titles": {
        [language]: scene,
      }
    },
  }) - 1;
  document.scenes[document.scene].meta = meta_index;

  return document;
}

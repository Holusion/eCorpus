import { IDocument } from "../../schema/document.js";

import { IModel } from "../../schema/model.js";

import { DerefModel,  SOURCE_INDEX,  toIdMap, toUriMap } from "./types.js";

export function appendModel(document :Required<IDocument>, {derivatives, annotations, [SOURCE_INDEX]: src_index, ...model} :DerefModel) :number{
  let iModel :IModel = {
    ...model,
    derivatives: [],
  };
  
  for (let derivative in derivatives){
    iModel.derivatives.push({
      ...derivatives[derivative],
      assets: Object.values(derivatives[derivative].assets),
    });
  }
  if(annotations){
    iModel.annotations = Object.values(annotations);
  }

  const idx = document.models.push(iModel) - 1;
  return idx;
}


export function mapModel({annotations, derivatives, ...iModel} :IModel, index: number) :DerefModel {
  const model = {
    ...iModel,
    derivatives: {} as DerefModel["derivatives"],
    annotations: annotations?toIdMap(annotations): undefined,
    [SOURCE_INDEX]: index,
  }
  for(let derivative of derivatives){
    const id = `${derivative.usage}/${derivative.quality}`;

    if(!Array.isArray(derivative.assets)){
      throw new Error("derivative.assets is not an array");
    }
    model.derivatives[id] = {
      ...derivative,
      assets: toUriMap(derivative.assets)
    };
  }

  return model;
}

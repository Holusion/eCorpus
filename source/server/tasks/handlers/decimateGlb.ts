import { TaskHandlerParams } from "../types.js";



interface DecimateGlbParams{
  inputs: {
    file: string,
  }
}

export default async function handleDecimateGlb({task: {fk_scene_id:scene_id, data}, signal, context:{vfs}}:TaskHandlerParams<DecimateGlbParams>){


};

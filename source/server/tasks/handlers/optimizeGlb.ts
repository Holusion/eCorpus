import { TaskHandlerParams } from "../types.js";



interface DecimateGlbParams{
  file: string,
}

export function optimizeGlb({task: {fk_scene_id:scene_id, data}, signal, context:{vfs}}:TaskHandlerParams<DecimateGlbParams>){
  //Takes a glb file as input, outputs an optimized file
  //It's not yet clear if the output file's path is determined beforehand or generated as an output
};

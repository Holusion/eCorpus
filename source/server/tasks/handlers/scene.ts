import path from "path";
import { parse_glb } from "../../utils/glTF.js";
import uid from "../../utils/uid.js";
import { TaskHandlerDefinition } from "../types.js";


interface AppendModelParams{
  inputs: {
    file: string,
    name: string,
    quality: string,
    usage: string,
    index: number,
  },
  outputs: {
    scene_id: number,
  }
}

export default {
  type: "appendModel",
  async handle({task: {fk_scene_id:scene_id, data}, signal, context:{vfs}}){
    let meta = await parse_glb(data.inputs.file);
    let mesh = meta.meshes[0]; //Take the first mesh for its name

    let model = {
      "units": "m", //glTF specification says it's always meters. It's what blender do.
      "boundingBox": meta.bounds,
      "derivatives":[{
        "usage": "Web3D",
        "quality": "High",
        "assets": [
          {
            "uri": `models/${data.inputs.name}`,
            "type": "Model",
            "byteSize": meta.byteSize,
            "numFaces": meta.meshes.reduce((acc, m)=> acc+m.numFaces, 0),
            "imageSize": 8192 /**@fixme should report proper texture sizes for LOD */
          }
        ]
      }],
      "annotations":[],
    };
    
    let node = {
      "id": uid(),
      "name": mesh?.name ?? path.basename(data.inputs.name, ".glb"),
      "model": 0,
    }

    await vfs.isolate(async (vfs)=>{
      let doc = await vfs.getDoc(scene_id, true);
      let docData = JSON.parse(doc.data);

    });

  },

} satisfies TaskHandlerDefinition<AppendModelParams>;

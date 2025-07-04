import { Request, Response } from "express";

import { BadRequestError } from "../../utils/errors.js";
import { getUser, getVfs } from "../../utils/locals.js";
import { HistoryEntry, ItemEntry } from "../../vfs/index.js";


/**
 * Restore a scene's history to just after some point. 
 * 
 * What is "before" or "after" is defined by the reverse of what is returned by `GET /scenes/:scene/history`
 * That is the algorithm will remove everything in indices :
 *  history[0] .. history[indexOf(:id)]
 *  
 * @see {getSceneHistory} 
 */
export async function postSceneHistory(req :Request, res :Response){
  // Keep in mind history is in reverse-natural order, with newest files coming first.
  // This makes everything "backward" from natural order
  let requester = getUser(req);
  let {scene:sceneName} = req.params;
  let {name, generation, id } = req.body;
  /**keep a reference to the name and generation of the files that are to be undone */
  let files :Map<string, number> = new Map();
  if(!(typeof name === "string" && typeof generation === "number") && typeof id !== "number"){
    throw new BadRequestError(`History restoration requires either "name" and "generation" or "id" to be set`);
  }

  await getVfs(req).isolate(async (vfs)=>{
    let scene = await vfs.getScene(sceneName);
    let index :number  = -1, offset = 0;
    while(index < 0){
      let historySlice = await vfs.getSceneHistory(scene.id, {limit: 100, offset});
      for(let idx = 0; idx < historySlice.length; idx++){
        const item = historySlice[idx];
        if(((typeof id === "number")? (item.id === id) : (item.name == name && item.generation == generation))){
          index = idx + offset;
          break;
        }
        files.set(item.name, item.generation);
      }
      if(historySlice.length < 100) break;
    }
    if(index === -1) throw new BadRequestError(`No file found in ${sceneName} matching ${typeof id =="number"? "id:"+id: (name+"#"+generation)}`);

    for (let [name, generation] of files.entries()){
      let prev =( (1 < generation)? (await vfs.getFileProps({scene: scene.id, name, generation: generation - 1, archive: true}, true)): null);
      if(prev?.data){
        await vfs.writeDoc(prev.data ?? null, {
          scene: scene.id,
          user_id: prev.author_id,
          name: name, 
          mime: prev.mime,
        });
      }else if(prev){
        await vfs.createFile({
          scene: scene.id,
          name: name,
          user_id: prev.author_id,
        }, {
          hash: prev.hash,
          size: prev.size,
          mime: prev.mime,
        });
      }else if(name==="scene.svx.json"){
        throw new BadRequestError("Can't delete a scene's document");
      }else{
        await vfs.createFile({
          scene: scene.id,
          name: name,
          user_id: requester.uid,
        }, {
          hash: null,
          size: 0,
        });
      }

    }
  });

  res.status(200).send({
    code: 200,
    message: `${files.size} files changed`,
    changes: [...files.keys()],
  });
}
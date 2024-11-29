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
  let requester = getUser(req);
  let {scene:sceneName} = req.params;
  let {name, generation } = req.body;
  let files :Map<string, HistoryEntry> = new Map();
  if(!(typeof name === "string" && typeof generation === "number")){
    throw new BadRequestError(`History restoration requires either of "name" and "generation" or "id" and "type" or "name" to be set`);
  }

  await getVfs(req).isolate(async (tr)=>{

    let scene = await tr.getScene(sceneName);
    let history = await tr.getSceneHistory(scene.id);
    
    /* Find index of the history entry we are restoring to */
    let index = history.findIndex((item)=> {
      return (item.name == name && item.generation == generation)
    });
    if(index === -1) throw new BadRequestError(`No file found in ${sceneName} matching ${(name+"#"+generation)}`);

    // Keep in mind history is in reverse-natural order, with newest files coming first.
    //Slice history to everything *after* index. That's every refs that was registered *before* cutoff.
    let refs = history.slice(index);
    //Keep a reference of files that will be modified: Every ref that is *before* index.
    files = new Map(history.slice(0, index).map(item=>([`${item.name}`, item])));

    for(let file of files.values()){
      //Find which version of the file needs to be restored :
      let prev = refs.find((ref)=> ref.name === file.name);
      if(file.mime !== "application/si-dpo-3d.document+json"){
        let theFile = (prev? await tr.getFileById(prev.id): {hash: null, size: 0});
        await tr.createFile({scene: scene.id, name: file.name, user_id: (prev? prev.author_id : requester.uid) }, theFile )
      }else if(typeof prev === "undefined"){
        throw new BadRequestError(`Trying to remove scene document for ${sceneName}. This would create an invalid scene`);
      }else{
        let {data} = await tr.getFileById(prev.id);
        await tr.writeDoc(data ?? null, {
          scene: scene.id,
          user_id: prev.author_id,
          name: "scene.svx.json", 
          mime: "application/si-dpo-3d.document+json",
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
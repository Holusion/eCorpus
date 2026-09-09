import { Request, Response } from "express";

import { PreconditionFailedError } from "../../../../../utils/errors.js";
import { getMimeType, getContentType } from "../../../../../utils/filetypes.js";
import { getVfs, getUserId, getFileParams } from "../../../../../utils/locals.js";
import type Vfs from "../../../../../vfs/index.js";
import { FileProps } from "../../../../../vfs/types.js";
import { text } from "stream/consumers";


/**
 * Strong comparison of an `If-Match` header against the hash we currently store, as
 * RFC 9110 §13.1.1 requires for a write precondition: `*` matches any existing
 * representation, otherwise one of the listed tags must be identical to ours.
 * A weak tag (`W/"…"`) never matches, which is why {@link handleGetFile} sends a strong one.
 */
function matchesIfMatch(header :string, hash :string|null|undefined) :boolean{
  //No hash means deleted or never created: there is no representation to match.
  if(!hash) return false;
  if(header.trim() === "*") return true;
  return header.split(",").some(tag => tag.trim() === `"${hash}"`);
}

export default async function handlePutFile(req :Request, res :Response){
  const vfs = getVfs(req);
  const user_id = getUserId(req);
  const { scene, name} = getFileParams(req);
  //If content-type can be inferred from the file's extension it's always better than the header
  // In particular because of https://github.com/Smithsonian/dpo-voyager/issues/202
  let mime = getContentType(req);
  const ifMatch = req.get("If-Match");

  const write = async (v :Vfs) :Promise<FileProps> => (mime.startsWith('text/'))
    ? await v.writeDoc(await text(req), {user_id, scene, name, mime })
    : await v.writeFile(req, {user_id, scene, name, mime });

  let r :FileProps;
  if(typeof ifMatch === "string"){
    //Read and write in one transaction. `getFileProps` takes the same row lock `createFile`
    //will, so a concurrent write either commits before we read it — and fails our
    //precondition — or waits for us and fails its own.
    r = await vfs.isolate(async tr =>{
      const current = await tr.getFileProps({scene, name, archive: true, lock: true})
      .catch((e :any)=>{
        if(e.code !== 404) throw e;
        return undefined;
      });
      if(!matchesIfMatch(ifMatch, current?.hash)){
        //Tell the client what it would have had to match, so it can fetch that version
        //and show the user what changed rather than just refusing the save.
        if(current?.hash) res.set("ETag", `"${current.hash}"`);
        throw new PreconditionFailedError(`${name} in ${scene} has changed since it was read`);
      }
      return await write(tr);
    });
  }else{
    r = await write(vfs);
  }

  //Without this Express would answer with the ETag of the string below, which validates
  //nothing. Report what we stored, so the client can save again without re-reading.
  if(r.hash) res.set("ETag", `"${r.hash}"`);
  res.status((r.generation === 1)?201:200).send("Created");
};

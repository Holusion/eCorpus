
import { Request, Response } from "express";
import { getUserManager } from "../../../utils/locals.js";




export default async function patchPermissions(req :Request, res :Response){
  let userManager = getUserManager(req);
  let {scene} = req.params;
  let patch = Array.isArray(req.body)? req.body: [req.body];
  await userManager.isolate(async userManager =>{
    for(let {username, uid, groupName, groupUid, access} of patch){
      if(!access || access == "none"){
        //To allow easier access unset from a form element that doesn't like null.
        access = null;
      }
      if (username || uid) {
        await userManager.grant(scene, uid || username, access);
      } else if (groupName || groupUid){
        await userManager.grantGroup(scene, groupUid || groupName, access);
      }
    }
  });
  res.status(204).send();
};
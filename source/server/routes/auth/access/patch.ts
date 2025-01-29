
import { Request, Response } from "express";
import { getUserManager } from "../../../utils/locals.js";




export default async function patchPermissions(req :Request, res :Response){
  let userManager = getUserManager(req);
  let {scene} = req.params;
  let {username, access} = req.body;
  if(username === "default" || username === "any"){
    //We don't want to remove "any" or "default" from the access map
    access = access? access: "none";
  }else if(!access || access == "none"){
    //To allow easier access unset from a form element that doesn't like null.
    access = null;
  }
  await userManager.grant(scene, username, access);
  res.status(204).send();
};
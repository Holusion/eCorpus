
import { Request, Response } from "express";
import { getUserManager } from "../../../utils/locals.js";




export default async function getSceneAccess(req :Request, res :Response){
  let userManager = getUserManager(req);
  let {scene} = req.params;
  let acl = await userManager.getAcl(scene);
  res.status(200).send(acl);
};

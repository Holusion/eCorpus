
import { UnauthorizedError } from "../../../utils/errors.js";
import { getFileParams, getUser, getUserId, getUserManager, getVfs } from "../../../utils/locals.js";
import { Request, Response } from "express";
import { qsToBool } from "../../../utils/query.js";
import { UserLevels } from "../../../auth/User.js";

export default async function handleDeleteScene(req :Request, res :Response){
  const vfs = getVfs(req);
  let user = getUser(req);
  const archive = qsToBool(req.query.archive) ?? true;
  if(user && user.level == "admin" && !archive ){
    await vfs.removeScene(req.params.scene);
  }else if(!archive){
    throw new UnauthorizedError(`force-delete requires instance-level admin rights`);
  }else{
    await vfs.archiveScene(req.params.scene);
  }
  res.status(204).send();
};
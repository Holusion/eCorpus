
import { Request, Response } from "express";
import { getUser, getVfs } from "../../utils/locals.js";

export default async function getTags(req :Request, res :Response){

  const vfs = getVfs(req);

  const tags = await vfs.getTags({user_id: getUser(req)?.uid ?? null});
  res.status(200).send(tags);
}
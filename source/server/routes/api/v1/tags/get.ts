
import { Request, Response } from "express";
import { getVfs } from "../../../../utils/locals.js";

export default async function getTags(req :Request, res :Response){

  const vfs = getVfs(req);

  const tags = await vfs.getTags();
  res.status(200).send(tags);
}
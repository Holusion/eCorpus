import { Request, Response } from "express";
import { getUserManager } from "../../utils/locals.js";
import UserManager from "../../auth/UserManager.js";

export default async function getGroups(req: Request, res: Response) {
  let userManager: UserManager = getUserManager(req);
  let groups = await userManager.getGroups();
  res.status(200).send(groups);
}
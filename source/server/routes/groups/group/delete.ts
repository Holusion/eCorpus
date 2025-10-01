import { Request, Response } from "express";
import { getUserManager } from "../../../utils/locals.js";
import UserManager from "../../../auth/UserManager.js";

export default async function deleteGroup(req: Request, res: Response) {
    let userManager: UserManager = getUserManager(req);
    const { group } = req.params;
    await userManager.removeGroup(group)
    res.status(204).send();
}
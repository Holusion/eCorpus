import { Request, Response } from "express";
import { getUserManager } from "../../../../utils/locals.js";
import UserManager from "../../../../auth/UserManager.js";

export default async function deleteMember(req: Request, res: Response) {
    let userManager: UserManager = getUserManager(req);
    const { group, member } = req.params;
    await userManager.removeMemberFromGroup(member, group);
    res.status(204).send();
}
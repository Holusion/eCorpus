import { Request, Response } from "express";
import { getUserId, getUserManager } from "../../../../utils/locals.js";
import UserManager from "../../../../auth/UserManager.js";

export default async function putMember(req: Request, res: Response) {
    let userManager: UserManager = getUserManager(req);
    const { group, member } = req.params;
    await userManager.addMemberToGroup(member, group, {by: getUserId(req)});
    res.status(200).send();
}
import { Request, Response } from "express";
import { getUser, getUserManager } from "../../../utils/locals.js";
import UserManager from "../../../auth/UserManager.js";
import { isUserAtLeast } from "../../../auth/User.js";
import { NotFoundError } from "../../../utils/errors.js";

export default async function getGroup(req: Request, res: Response) {
    let userManager: UserManager = getUserManager(req);
    let user = getUser(req);
    const { group } = req.params;
    if (user && (isUserAtLeast(user, "manage") || await userManager.isMemberOfGroup(user.uid, group))){
        let groups = await userManager.getGroup(group);
        res.status(200).send(groups);
    } 
    else {
        throw new NotFoundError()
    }
}
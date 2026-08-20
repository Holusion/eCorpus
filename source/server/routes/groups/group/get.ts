import { Request, Response } from "express";
import { getUserManager } from "../../../utils/locals.js";

export default async function getGroup(req: Request, res: Response) {
    //The route's policy({perms:"read", on:"group"}) resolved access already:
    //a member, a manage-level user, or an admin — anyone else got a 404.
    const { group } = req.params;
    res.status(200).send(await getUserManager(req).getGroup(group));
}


import { Request, Response } from "express";

import { getUserId, getUserManager } from "../../utils/locals.js";
import UserManager from "../../auth/UserManager.js";
import { BadRequestError } from "../../utils/errors.js";
import Group from "../../auth/Group.js";




export default async function postGroups(req: Request, res: Response) {
  let userManager: UserManager = getUserManager(req);
  let { groupName, members } = req.body;
  const by = getUserId(req);
  if (!groupName) throw new BadRequestError("name not provided");
  let group: Group;
  if (!members) {
    group = await userManager.addGroup(groupName);
  }
  else {
    await userManager.isolate(async userManager => {
      group = await userManager.addGroup(groupName);
      await Promise.all(members.map((member: string | number) =>
        userManager.addMemberToGroup(member, group.groupUid, {by})
      ))
    })
    group = await userManager.getGroup(groupName);
  }
  res.status(201).send(group);
};

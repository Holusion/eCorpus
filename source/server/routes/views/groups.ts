import { Router } from "express";
import { getHost, getUser, getUserManager, policy } from "../../utils/locals.js";
import { isUserAtLeast } from "../../auth/User.js";

/**
 * A group, its members and its scenes, as /ui/groups/*
 */
const routes = Router();

routes.get("/:group", policy({ access: "read", on: "group" }), async (req, res)=>{
  const host = getHost(req);
  const userManager = getUserManager(req);
  const requester = getUser(req);
  const {group} = req.params;
  const groupObj = await userManager.getGroup(group);
  res.render("group", {
    name: groupObj.groupName,
    id: groupObj.groupUid,
    manageAccess: requester? isUserAtLeast(requester, "manage"): false,
    scenes: groupObj.scenes,
    members: groupObj.members,
  });
});

export default routes;

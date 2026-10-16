import { apiMessage } from "../../utils/messages/index.js";

import { Request, Response } from "express";
import { AccessLevel } from "../../auth/UserManager.js";
import { effectiveAccess, getUser, getUserManager, getVfs } from "../../utils/locals.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors.js";


/**
 * Currently supports removing tags in batch
 * @param req
 * @param res
 * @returns {Promise<void>}
 */
export default async function patchTags(req: Request, res: Response) {
  let userManager = getUserManager(req);
  let requester = getUser(req);

  let patch = Array.isArray(req.body) ? req.body : [req.body];
  const vfs = getVfs(req);
  //  request validation :
  for (let { name, action } of patch) {
    if (name.length < 1) { throw new BadRequestError(apiMessage("errors.tag-name-should-not-be-empty")) }
    if (action != "delete" && action != "create") {
      throw new BadRequestError(apiMessage("errors.bad-action-request"));
    }
  };

  //Tagging is a per-scene write. A token's scope caps the access level like the
  //canWrite guard would (the cap applies to the level, never to visibility):
  //effectiveAccess folds the ACL right with that credential cap.
  await userManager.isolate(async userManager => {
    for (let { name, scene, action } of patch) {
      // action equals "action" OR "delete"
      let rights = await userManager.getAccessRights(scene, requester ? requester.uid: null);
      if (requester && requester.level == "admin") rights = AccessLevel.Admin;
      const effective = effectiveAccess(res, rights);
      if (AccessLevel.Write <= effective) {
        action == "create" ? await vfs.addTag(scene, name) : await vfs.removeTag(scene, name);
      } else {
        if (rights == AccessLevel.None) {
          throw new NotFoundError(apiMessage("errors.scene-was-not-found", { value1: String(typeof (scene) == "number" ? `${scene} id` : `named ${scene}`) }));
        } else {
          throw new ForbiddenError(apiMessage("errors.insufficient-rights-on-scene", { value1: String(typeof (scene) == "number" ? `${scene} id` : `named ${scene}`) }));
        }

      }
    }
  });
  res.status(200).send();
};


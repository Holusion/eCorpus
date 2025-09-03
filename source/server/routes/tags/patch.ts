
import { Request, Response } from "express";
import { getUser, getUserManager, getVfs } from "../../utils/locals.js";
import { BadRequestError, ForbiddenError } from "../../utils/errors.js";


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
  await userManager.isolate(async userManager => {
    for (let { name, scene, action } of patch) {
      if (name.length < 1) { throw new BadRequestError("tag name should not be empty") }
      const parsedScene = Number.isNaN(parseInt(scene)) ? scene : parseInt(scene);
      if (action != "delete" && action != "create") {
        throw new BadRequestError("Bad action request");
      };
      // action equals "action" OR "delete"
      if (requester.level == "admin") {
        action == "create" ? await vfs.addTag(parsedScene, name) : await vfs.removeTag(parsedScene, name);
      }
      else {
        let rights = await userManager.getAccessRights(parsedScene, requester.uid);
        if (rights == "write" || rights == "admin") {
          action == "create" ? await vfs.addTag(parsedScene, name) : await vfs.removeTag(parsedScene, name);
        } else {
          throw new ForbiddenError;
        }
      }
    }
  });
  res.status(200).send();
};



import { Request, Response } from "express";
import { getUser, getUserManager, getVfs } from "../../utils/locals.js";
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
    if (name.length < 1) { throw new BadRequestError("tag name should not be empty") }
    if (action != "delete" && action != "create") {
      throw new BadRequestError("Bad action request");
    }
  };

  await userManager.isolate(async userManager => {
    for (let { name, scene, action } of patch) {
      // action equals "action" OR "delete"
      let rights = await userManager.getAccessRights(scene, requester ? requester.uid: null);
      if (rights == "write" || rights == "admin" || (requester && requester.level == "admin")) {
        action == "create" ? await vfs.addTag(scene, name) : await vfs.removeTag(scene, name);
      } else {
        if (rights == "none") {
          throw new NotFoundError(`Scene ${typeof (scene) == "number" ? `${scene} id` : `named ${scene}`} was not found`);
        } else {
          throw new ForbiddenError(`Insufficient rights on scene ${typeof (scene) == "number" ? `${scene} id` : `named ${scene}`}`);
        }

      }
    }
  });
  res.status(200).send();
};


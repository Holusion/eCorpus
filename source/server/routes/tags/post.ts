
import { Request, Response } from "express";
import { getUser, getUserManager, getVfs } from "../../utils/locals.js";
import { ForbiddenError } from "../../utils/errors.js";


/**
 * Add tags to scenes
 * @param req
 * @param res
 * @returns {Promise<void>}
 */
export default async function postTags(req: Request, res: Response) {
  let userManager = getUserManager(req);
  let requester = getUser(req);

  let post = Array.isArray(req.body) ? req.body : [req.body];
  const vfs = getVfs(req);
  await userManager.isolate(async userManager => {
    for (let { name, scene } of post) {
      const parsedScene = Number.isNaN(parseInt(scene))? scene : parseInt(scene);  
      if (requester.level == "admin") await vfs.addTag(parsedScene, name);
      else {
        let rights = await userManager.getAccessRights(parsedScene, requester.uid);
        if (rights == "write" || rights == "admin") {
          await vfs.addTag(parsedScene, name);
        } else {
          throw new ForbiddenError;
        }
      }
    }
  });
  res.status(200).send();
};

//Look into 201
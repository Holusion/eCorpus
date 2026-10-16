import { apiMessage } from "../../../utils/messages/index.js";
import { Request, Response } from "express";

import { getUserId, getLocals } from "../../../utils/locals.js";
import { BadRequestError, UnauthorizedError } from "../../../utils/errors.js";
import { inspectGlb } from "../../../tasks/handlers/inspectGlb.js";
import { createDocumentFromFiles } from "../../../tasks/handlers/createDocumentFromFiles.js";
import { isSceneLanguage, SceneLanguage } from "../../../utils/languages.js";




/**
 * Tries to create a scene.
 * has consistency problems : a scene could get created without its associated 3D object
 * Whether or not it's desired behaviour remains to be defined
 */
export default async function postScene(req: Request, res: Response) {
  const { vfs, taskScheduler } = getLocals(req);
  let user_id = getUserId(req);
  let { scene } = req.params;
  const { language: queryLanguage } = req.query;
  if (req.is("multipart") || req.is("application/x-www-form-urlencoded")) {
    throw new BadRequestError(apiMessage("errors.content-is-not-supported-on-this-route-provide-a-raw-zip-attachment", { value1: String(req.get("Content-Type")) }));
  }
  if (queryLanguage && (typeof queryLanguage !== "string" || !isSceneLanguage(queryLanguage.toUpperCase()))) {
    throw new BadRequestError(apiMessage("errors.invalid-scene-language-requested", { value1: String(queryLanguage) }))
  }
  const language = queryLanguage?.toUpperCase() as SceneLanguage | undefined;
  if (!user_id) {
    throw new UnauthorizedError(apiMessage("errors.requires-authenticated-user"));
  }

  let scene_id = await vfs.createScene(scene, user_id);
  await taskScheduler.run({
    scene_id,
    user_id,
    type: "postScene",
    data: {
      language,
      scene,
    },
    handler: async function postsSceneHandler({ context: { logger, vfs } }) {
      logger.debug("Draining the HTTP request into scene space");
      let f = await vfs.writeFile(req, { user_id, scene: scene, mime: "model/gltf-binary", name: `${scene}.glb` });
      if (f.size == 0 || !f.hash) throw new BadRequestError(apiMessage("errors.body-was-empty-can-t-create-a-scene"));
      logger.debug("Parse the created file");
      const meta = await taskScheduler.run({
        immediate: true,
        data: { fileLocation: vfs.relative(vfs.getPath(f as { hash: string })) },
        handler: inspectGlb,
      });

      logger.debug(`Generate default document for model ${meta.name}`);
      const document = await taskScheduler.run({
        immediate: true,
        handler: createDocumentFromFiles,
        data: {
          scene: scene,
          language: language,
          models: [{
            uri: f.name,
            quality: "High",
            usage: "Web3D",
            byteSize: f.size,
            ...meta,
          }],
        }
      });
      logger.debug(`Write scene document`);
      await vfs.writeDoc(JSON.stringify(document), {
        scene: scene_id,
        user_id: user_id,
        name: "scene.svx.json",
        mime: "application/si-dpo-3d.document+json"
      });
    }
  }).catch(async e => {
    //If written, the file will stay as a loose object but will get cleaned-up later
    await vfs.removeScene(scene_id).catch(e => console.warn(e));
    throw e;
  });

  res.status(201).send({ code: 201, message: "created scene with id :" + scene_id });
};

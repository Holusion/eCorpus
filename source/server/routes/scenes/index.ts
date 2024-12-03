import { Router } from "express";

import bodyParser from "body-parser";

import { canAdmin, canRead, canWrite, isAdministrator, isUser } from "../../utils/locals.js";
import wrap from "../../utils/wrapAsync.js";


import getScenes from "./get.js";
import {handlePropfind} from "./propfind.js";
import handlePostScene from "./post.js";

import handleDeleteScene from "./scene/delete.js";
import handleCreateScene from "./scene/mkcol.js";
import getScene from "./scene/get.js";
import patchScene from "./scene/patch.js";

import handleDeleteFile from "./scene/files/delete/file.js";
import handleGetDocument from "./scene/files/get/document.js";
import handleGetFile from "./scene/files/get/file.js";
import handleMoveFile from "./scene/files/move/file.js";
import handlePutDocument from "./scene/files/put/document.js";
import handlePutFile from "./scene/files/put/file.js";
import handleCreateFolder from "./scene/files/mkcol/folder.js";
import postScene from "./scene/post.js";



const router = Router();
/** Configure cache behaviour for everything under `/scenes/**`
 * Settings can be changed individually further down the line
 */
router.use((req, res, next)=>{
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Cache-Control", "no-cache, private");
  next();
});

router.get("/", wrap(getScenes));
router.propfind("/", wrap(handlePropfind));
router.post("/", isAdministrator, wrap(handlePostScene));

//allow POST outside of canRead : overwrite permissions are otherwise checked
router.post("/:scene", wrap(postScene));

//Allow mkcol outside of canRead check
router.mkcol(`/:scene`, wrap(handleCreateScene));

/**
 * Protect everything after this with canRead handler
 */
router.use("/:scene", canRead);

router.get("/:scene", wrap(getScene));
router.propfind("/:scene", wrap(handlePropfind));
router.patch("/:scene", canAdmin,  bodyParser.json(), wrap(patchScene));
router.delete("/:scene", canAdmin, wrap(handleDeleteScene));


router.propfind("/:scene/*", wrap(handlePropfind));

router.get("/:scene/:file(*.svx.json)", wrap(handleGetDocument));
router.put("/:scene/:file(*.svx.json)", 
  canWrite,
  bodyParser.json({type:["application/si-dpo-3d.document+json", "application/json"], limit: 204800}),
  wrap(handlePutDocument)
);


router.get(`/:scene/:name(*)`, wrap(handleGetFile));
router.put(`/:scene/:name(*)`, canWrite, wrap(handlePutFile));
router.move(`/:scene/:name(*)`, canWrite, wrap(handleMoveFile));
router.delete(`/:scene/:name(*)`, canWrite, wrap(handleDeleteFile));
router.mkcol(`/:scene/:name(*)`, canWrite, wrap(handleCreateFolder));

export default router;

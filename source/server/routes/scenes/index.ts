import { Router } from "express";

import bodyParser from "body-parser";

import {handlePropfind} from "./propfind.js";
import {handlePutFile, handlePutDocument} from "./put/index.js";
import { canAdmin, canRead, canWrite, isAdministrator, isUser } from "../../utils/locals.js";
import wrap from "../../utils/wrapAsync.js";


import handleGetDocument from "./get/document.js";
import handleGetFile from "./get/file.js";
import handleMoveFile from "./move/file.js";
import handleDeleteFile from "./delete/file.js";
import handleCopyFile from "./copy/file.js";
import handleCopyDocument from "./copy/document.js";
import handleDeleteScene from "./delete/scene.js";
import handleCreateFolder from "./mkcol/folder.js";
import handleCreateScene from "./mkcol/scene.js";

const router = Router();
/** Configure cache behaviour for everything under `/scenes/**`
 * Settings can be changed individually further down the line
 */
router.use((req, res, next)=>{
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Cache-Control", "no-cache, private");
  next();
});

router.propfind("/", wrap(handlePropfind));

//Allow mkcol outside of canRead check
router.mkcol(`/:scene`, wrap(handleCreateScene));

/**
 * Protect everything after this with canRead handler
 */
router.use("/:scene", canRead);
router.propfind("/:scene", wrap(handlePropfind));
router.delete("/:scene", canAdmin, wrap(handleDeleteScene));


router.propfind("/:scene/*", wrap(handlePropfind));

router.get("/:scene/:file(*.svx.json)", wrap(handleGetDocument));
router.put("/:scene/:file(*.svx.json)", 
  canWrite,
  bodyParser.json({type:["application/si-dpo-3d.document+json", "application/json"], limit: 204800}),
  wrap(handlePutDocument)
);
router.copy("/:scene/:file(*.svx.json)", canWrite, wrap(handleCopyDocument));


router.get(`/:scene/:name(*)`, wrap(handleGetFile));
router.put(`/:scene/:name(*)`, canWrite, wrap(handlePutFile));
router.move(`/:scene/:name(*)`, canWrite, wrap(handleMoveFile));
router.copy(`/:scene/:name(*)`, canWrite, wrap(handleCopyFile));
router.delete(`/:scene/:name(*)`, canWrite, wrap(handleDeleteFile));
router.mkcol(`/:scene/:name(*)`, canWrite, wrap(handleCreateFolder));

export default router;

import { NextFunction, Request, Response, Router } from "express";

import {handlePropfind} from "./propfind.js";
import {handlePutFile, handlePutDocument} from "./put/index.js";
import { canRead, canWrite, isAdministrator, isUser } from "../../utils/locals.js";
import wrap from "../../utils/wrapAsync.js";
import bodyParser from "body-parser";

import handleGetDocument from "./get/document.js";
import handleGetFile from "./get/file.js";
import handleMoveFile from "./move/file.js";
import handleDeleteFile from "./delete/file.js";
import handleCopyFile from "./copy/file.js";
import handleCopyDocument from "./copy/document.js";
import handleDeleteScene from "./delete/scene.js";
import handleMkcol from "./mkcol.js";

const router = Router();
/** Configure cache behaviour for everything under `/scenes/**`
 * Settings can be changed individually further down the line
 */
router.use((req, res, next)=>{
  res.set("Cache-Control", "max-age=0, must-revalidate");
  next();
});

router.propfind("/", wrap(handlePropfind));

router.use("/:scene", canRead);
router.propfind("/:scene", wrap(handlePropfind));
router.propfind("/:scene/*", wrap(handlePropfind));
router.delete("/:scene", isAdministrator, wrap(handleDeleteScene));

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
router.mkcol(`/:scene/:name(*)`, canWrite, wrap(handleMkcol));

export default router;

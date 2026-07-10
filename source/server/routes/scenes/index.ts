import { Router } from "express";

import bodyParser from "body-parser";

import { isUser, policy, requireScope } from "../../utils/locals.js";
import wrap from "../../utils/wrapAsync.js";


import getScenes from "./get.js";
import {handlePropfind} from "./propfind.js";
import handlePostScenes from "./post.js";

import handleDeleteScene from "./scene/delete.js";
import handleCreateScene from "./scene/mkcol.js";
import handleGetScene from "./scene/get.js";
import handlePatchScene from "./scene/patch.js";
import handlePostScene from "./scene/post.js";

import handleDeleteFile from "./scene/files/delete/file.js";
import handleGetDocument from "./scene/files/get/document.js";
import handleGetFile from "./scene/files/get/file.js";
import handleMoveFile from "./scene/files/move/file.js";
import handlePutDocument from "./scene/files/put/document.js";
import handlePutFile from "./scene/files/put/file.js";
import handleCreateFolder from "./scene/files/mkcol/folder.js";



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
// additional checks are used in postScenes to allow people to overrite scenes they have write access on
//Bulk zip import creates and overwrites scenes with the owner's per-scene
//rights (extractZip checks each), so the *level* here is only "authenticated"
//(a `use` user can update scenes they have ACL on). requireScope gates the
//*token*: a delegated credential must carry scenes:create to import at all.
router.post("/", requireScope("scenes:create"), isUser, bodyParser.json(), wrap(handlePostScenes));

//Creating or overwriting one named scene: create level + scenes:create scope.
router.post("/:scene", policy({ scope: "scenes:create", perms: null }), wrap(handlePostScene));
router.mkcol(`/:scene`, policy({ scope: "scenes:create", perms: null }), wrap(handleCreateScene));

//Per-leaf policies (were a blanket `router.use("/:scene", canRead)` prefix):
//each declares its own scene-ACL level, from which the scenes:* scope derives.
router.get("/:scene", policy({ scope: null, perms: "read" }), wrap(handleGetScene));
router.propfind("/:scene", policy({ scope: null, perms: "read" }), wrap(handlePropfind));
router.patch("/:scene", policy({ scope: null, perms: "admin" }), bodyParser.json(), wrap(handlePatchScene));
router.delete("/:scene", policy({ scope: null, perms: "admin" }), wrap(handleDeleteScene));


router.propfind("/:scene/*", policy({ scope: null, perms: "read" }), wrap(handlePropfind));

router.get("/:scene/:file(*.svx.json)", policy({ scope: null, perms: "read" }), wrap(handleGetDocument));
router.put("/:scene/:file(*.svx.json)",
  policy({ scope: null, perms: "write" }),
  bodyParser.json({type:["application/si-dpo-3d.document+json", "application/json"], limit: 4e6}),
  wrap(handlePutDocument)
);


router.get(`/:scene/:name(*)`, policy({ scope: null, perms: "read" }), wrap(handleGetFile));
router.put(`/:scene/:name(*)`, policy({ scope: null, perms: "write" }), wrap(handlePutFile));
router.move(`/:scene/:name(*)`, policy({ scope: null, perms: "write" }), wrap(handleMoveFile));
router.delete(`/:scene/:name(*)`, policy({ scope: null, perms: "write" }), wrap(handleDeleteFile));
router.mkcol(`/:scene/:name(*)`, policy({ scope: null, perms: "write" }), wrap(handleCreateFolder));

export default router;

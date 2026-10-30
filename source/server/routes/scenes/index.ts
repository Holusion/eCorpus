import express, { Router } from "express";


import { policy, requireScope } from "../../utils/locals.js";


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

router.get("/", getScenes);
router.propfind("/", handlePropfind);
//Bulk zip import both creates scenes (corpus:write) and overwrites existing
//ones (scenes:write): the credential must carry both to start. The *level* is
//deliberately not gated here (a `use` user can update scenes they have ACL
//on): extractZip re-checks each scene as it goes — user ACL ≥ write for
//updates, level ≥ create for creations — so everything the detached task does
//stays inside what the credential proved at the gate. requireScope also
//rejects anonymous requests, so no separate identity guard.
router.post("/", requireScope("corpus:write", "scenes:write"), express.json(), handlePostScenes);

//Creating or overwriting one named scene: create level + corpus:write scope.
router.post("/:scene", policy({ scope: "corpus:write", access: null }), handlePostScene);
router.mkcol(`/:scene`, policy({ scope: "corpus:write", access: null }), handleCreateScene);

//Per-leaf policies (were a blanket `router.use("/:scene", canRead)` prefix):
//each declares its own scene-ACL level, from which the scenes:* scope derives.
router.get("/:scene", policy({ scope: null, access: "read" }), handleGetScene);
router.propfind("/:scene", policy({ scope: null, access: "read" }), handlePropfind);
router.patch("/:scene", policy({ scope: null, access: "admin" }), express.json(), handlePatchScene);
router.delete("/:scene", policy({ scope: null, access: "admin" }), handleDeleteScene);


router.propfind("/:scene/*path", policy({ scope: null, access: "read" }), handlePropfind);

router.get("/:scene/*file.svx.json", policy({ scope: null, access: "read" }), handleGetDocument);
router.put("/:scene/*file.svx.json",
  policy({ scope: null, access: "write" }),
  express.json({type:["application/si-dpo-3d.document+json", "application/json"], limit: 4e6}),
  handlePutDocument
);


router.get(`/:scene/*name`, policy({ scope: null, access: "read" }), handleGetFile);
router.put(`/:scene/*name`, policy({ scope: null, access: "write" }), handlePutFile);
router.move(`/:scene/*name`, policy({ scope: null, access: "write" }), handleMoveFile);
router.delete(`/:scene/*name`, policy({ scope: null, access: "write" }), handleDeleteFile);
router.mkcol(`/:scene/*name`, policy({ scope: null, access: "write" }), handleCreateFolder);

export default router;

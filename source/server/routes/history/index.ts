
import express, { Router } from "express";
import { policy } from "../../utils/locals.js";



import { postSceneHistory } from "./post.js";
import getSceneHistory from "./get.js";
import handleGetDiff from "./diff/get.js";
import { handleShowFile } from "./show/get.js";

const router = Router();

/** Configure cache behaviour for the whole API
 * Settings can be changed individually further down the line
 */
router.use((req, res, next)=>{
  //Browser should always make the request
  res.set("Cache-Control", "no-cache");
  next();
});

/** Reading a scene's past: its own delegation (`history:read`) on top of plain
 * scene read access. The scope is what makes an audit token possible — the ACL
 * level a route declares also demands the matching `scenes:<level>` from the
 * credential, so while these sat at `access: "write"` no token could read
 * history without also being able to write scenes.
 *
 * `history:read` is not in `PUBLIC_SCOPES`, so anonymous is refused before the
 * ACL is consulted: a public scene's contributors stay unenumerable. Every
 * authenticated user from `use` up holds it, so the ACL alone decides which
 * scenes — including whatever `default_access` hands out.
 */
const readHistory = policy({ scope: "history:read", access: "read" });

router.get("/:scene", readHistory, getSceneHistory);
//Restoring a version is a scene write, not a history one.
router.post("/:scene", policy({ access: "admin" }), express.json(), postSceneHistory);

router.get("/:scene/:id/diff", readHistory, handleGetDiff);
router.get("/:scene/:id/diff/:from", readHistory, handleGetDiff);

router.get("/:scene/:id/show/*name", readHistory, handleShowFile);

export default router;

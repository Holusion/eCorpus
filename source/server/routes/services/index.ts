
import { Router } from "express";

import wrap from "../../utils/wrapAsync.js";
import { renderOpenSearch } from "./opensearch.js";
import { getEmbed } from "./oembed.js";


const router = Router();
router.use("/", (req, res, next)=>{
  //CORS might be needed if someone wants to do client-side oembed or opensearch discovery
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Cache-Control", `max-age=${3600*24*30}, public`);
  next();
});

router.get("/opensearch.xml", renderOpenSearch);
router.get("/oembed", wrap(getEmbed));

export default router;

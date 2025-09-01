
import { Router } from "express";

import wrap from "../../utils/wrapAsync.js";
import { renderOpenSearch } from "./opensearch.js";
import { getEmbed } from "./oembed.js";


const router = Router();

router.get("/opensearch.xml", renderOpenSearch);
router.get("/oembed", wrap(getEmbed));

export default router;

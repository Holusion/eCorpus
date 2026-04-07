import path from "path";
import createService from "./create.js";
import config from "./utils/config.js";

//@ts-ignore
import("source-map-support").then((s)=>{
    s.install();
}, (e)=>console.log("Source maps not supported"));


(async ()=>{
    let root = path.resolve(config.root_dir);
    console.info("Serve directory : "+root+" on "+config.port);
    const services = await createService(config);
    services.app.listen(config.port, () => {
        console.info(`Server ready and listening on port ${config.port}\n`);
    });
})();

import path from "path";
import createService from "./create.js";
import staticConfig from "./utils/config.js";

//@ts-ignore
import("source-map-support").then((s)=>{
    s.install();
}, (e)=>console.log("Source maps not supported"));


(async ()=>{
    let root = path.resolve(staticConfig.root_dir);
    console.info("Serve directory : "+root+" on "+staticConfig.port);
    const services = await createService();
    services.app.listen(staticConfig.port, () => {
        console.info(`Server ready and listening on port ${staticConfig.port}\n`);
    });
})();

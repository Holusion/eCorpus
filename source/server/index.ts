/**
 * 3D Foundation Project
 * Copyright 2019 Smithsonian Institution
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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


import path from "path";
import util from "util";
import cookieSession from "cookie-session";
import express from "express";

import UserManager from "./auth/UserManager.js";
import { BadRequestError, HTTPError } from "./utils/errors.js";
import { mkdir } from "fs/promises";

import {AppLocals, canRead, canWrite, getHost, getUserManager, isUser} from "./utils/locals.js";

import openDatabase from "./vfs/helpers/db.js";
import Vfs from "./vfs/index.js";
import defaultConfig from "./utils/config.js";
import User from "./auth/User.js";
import Templates from "./utils/templates.js";


export default async function createServer(config = defaultConfig) :Promise<express.Application>{

  await Promise.all([config.files_dir].map(d=>mkdir(d, {recursive: true})));
  let db = await openDatabase({filename: path.join(config.files_dir, "database.db"), forceMigration: config.force_migration});
  const vfs = await Vfs.Open(config.files_dir, {db});

  const userManager = new UserManager(db);

  const templates = new Templates({dir: config.templates_dir, cache: config.node_env == "production"});

  const app = express();
  app.disable('x-powered-by');
  app.set("trust proxy", config.trust_proxy);

  if(config.clean_database){
    setTimeout(()=>{
      //Clean file system after a while to prevent delaying startup
      vfs.clean().then(()=>console.log("Cleanup done."), e=> console.error("Cleanup failed :", e));
    }, 60000).unref();

    setInterval(()=>{
      vfs.optimize();
    }, 2*3600*1000).unref();
  } 


  app.locals  = Object.assign(app.locals, {
    userManager,
    fileDir: config.files_dir,
    vfs,
    templates,
    config,
  }) as AppLocals;

  app.use(cookieSession({
    name: 'session',
    keys: await userManager.getKeys(),
    // Cookie Options
    maxAge: 31 * 24 * 60 * 60 * 1000, // 1 month
    sameSite: "strict"
  }));

  app.use((req, res, next)=>{
    if((req.session as any).uid) return next();
    let auth = req.get("Authorization");
    if(!auth) return next()
    else if(!auth.startsWith("Basic ") ||  auth.length <= "Basic ".length ) return next();
    let [username, password] = Buffer.from(auth.slice("Basic ".length), "base64").toString("utf-8").split(":");
    if(!username || !password) return next();
    getUserManager(req).getUserByNamePassword(username, password).then((user)=>{
      Object.assign(req.session as any, User.safe(user));
      next();
    }, (e)=>{
      if((e as HTTPError).code === 404) next();
      else next(e);
    });
  });

  
  /* istanbul ignore next */
  if (config.verbose) {
    let {default: morgan} = await import("morgan"); 
    //Requests logging is enabled only in dev mode as a proxy would handle it in production
    app.use(morgan(process.stdout.isTTY?"dev": "tiny", {
    }));
  }

  
  app.engine('.hbs', templates.middleware);
  app.set('view engine', '.hbs');
  app.set('views', templates.dir);


  app.get(["/"], (req, res)=> res.redirect("/ui/"));

  /**
   * Set permissive cache-control for ui pages
   */
  app.use("/ui", (req :express.Request, res:express.Response, next)=>{
    res.set("Cache-Control", `max-age=${30*60}, public`);
    next();
  });

  //Ideally we would like a really long cache time for /dist but it requires unique filenames for each build
  //Allow CORS for assets that might get embedded
  app.use("/dist", (req, res, next)=>{
    res.set("Cache-Control", `max-age=${30*60}, public`);
    res.set("Access-Control-Allow-Origin", "*");
    next();
  });

  app.use("/ui/scenes/:scene/", canRead);

  app.get("/ui/scenes/:scene/view", (req, res)=>{
    let {scene} = req.params;
    let {lang, tour} = req.query;
    let host = getHost(req);
    let referrer = new URL(req.get("Referrer")||`/ui/scenes/`, host);
    let thumb = new URL(`/scenes/${encodeURIComponent(scene)}/scene-image-thumb.jpg`, host);
    
    let script = undefined;
    if(tour && !Number.isNaN(parseInt(tour as any))){
      script = `
        const v = document.querySelector("voyager-explorer");
        v?.on("model-load",()=>{
          v?.toggleTours();
          v?.setTourStep(${parseInt(tour as any)}, 0, true);
        })
      `;
    }


    res.render("explorer", {
      title: `${scene}: Explorer`,
      scene,
      thumb: thumb.toString(),
      referrer: referrer.toString(),
      script
    });
  });


  app.get("/ui/scenes/:scene/edit", canWrite, (req, res)=>{
    let {scene} = req.params;
    let {lang} = req.query;
    let host = getHost(req);
    let referrer = new URL(req.get("Referrer")||`/ui/scenes/`, host);
    let thumb = new URL(`/scenes/${encodeURIComponent(scene)}/scene-image-thumb.jpg`, host);
    
    res.render("story", {
      title: `${scene}: Story Editor`,
      scene,
      thumb: thumb.toString(),
      referrer: referrer.toString(),
      mode: "Edit",
    });
  });
  
  app.get("/ui/standalone", (req, res)=>{
    let {lang} = req.query;
    let host = getHost(req);
    let referrer = new URL(req.get("Referrer")||`/ui/scenes/`, host);

    res.render("story", {
      title: `Standalone Story`,
      mode: "Standalone",
      thumb: "/images/sketch_ethesaurus.png",
      referrer: referrer.toString(),
    });
  });

  app.get(["/ui/", "/ui/*"],(req, res)=>{
    res.render("home", {
      title: "eCorpus",
      thumb: "/images/sketch_ethesaurus.png"
    });
  });


  if(config.assets_dir){
    app.use("/dist", express.static(config.assets_dir));
  }

  /* istanbul ignore next */
  if(config.hot_reload){
    console.log("Hot reload enabled");
    const {default: webpack} = await import("webpack");
    const {default: middleware} = await import("webpack-dev-middleware");
    //@ts-ignore
    const {default: configGenerator} = await import("../ui/webpack.config.js");

    const compiler = webpack(configGenerator());
    const webpackInstance = middleware(compiler as any, {});
    app.use("/dist", webpackInstance);
    await new Promise(resolve=> webpackInstance.waitUntilValid(resolve));
  }else{
    // static file server
    app.use("/dist", express.static(config.dist_dir));

  }


  //Privilege-protected routes
  app.use("/scenes", (await import("./routes/scenes/index.js")).default);

  app.use("/api/v1", (await import("./routes/api/v1/index.js")).default);


  const log_errors = process.env["TEST"] !== 'true';
  const isTTY = process.stderr.isTTY;

  // error handling
  // istanbul ignore next
  //@ts-ignore
  app.use((error, req, res, next) => {
    if(log_errors) console.error(isTTY ? error : util.inspect(error, {
      compact: 3,
      breakLength: Infinity,
    }).replace(/\n/g,"\\n"));
    
    if (res.headersSent) {
      console.warn("An error happened after headers were sent for %s : %s", req.method, req.originalUrl);
      return next(error);
    }
    let code = (error instanceof HTTPError )? error.code : 500;

    if(code === 401 
    //We try to NOT send the header for browser requests because we prefer the HTML login to the browser's popup
      //Browser tends to prefer text/html and always send Mozilla/5.0 at the beginning of their user-agent
      //If someone has customized their headers, they'll get the ugly popup and live with it.
      && !(req.get("Accept")?.startsWith("text/html") && req.get("User-Agent")?.startsWith("Mozilla"))
      //Also don't apply it for login route because it doesn't make any sense.
      && req.path !== "/api/v1/login"
    ){
      res.set("WWW-Authenticate", "Basic realm=\"authenticated access\"");
    }

    res.format({
      "application/json": ()=> {
        res.status(code).send({ code, message: `${error.name}: ${error.message}` })
      },
      "text/html": ()=>{
        // send error page
        res.status(code).render("error", { error });
      },
      "text/plain": ()=>{
        res.status(code).send(error.message);
      },
      default: ()=> res.status(code).send(error.message),
    });
  });

  return app;
}

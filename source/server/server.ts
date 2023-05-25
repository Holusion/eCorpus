
import path from "path";
import util from "util";
import cookieSession from "cookie-session";
import express from "express";
import { engine } from 'express-handlebars';

import UserManager from "./auth/UserManager";
import { BadRequestError, HTTPError } from "./utils/errors";
import { mkdir } from "fs/promises";

import {AppLocals, getHost, getUserManager} from "./utils/locals";

import openDatabase from './vfs/helpers/db';
import Vfs from "./vfs";
import defaultConfig from "./utils/config";
import User from "./auth/User";


export default async function createServer(config = defaultConfig) :Promise<express.Application>{

  await Promise.all([config.files_dir].map(d=>mkdir(d, {recursive: true})));
  let db = await openDatabase({filename: path.join(config.files_dir, "database.db"), forceMigration: config.force_migration});
  const vfs = await Vfs.Open(config.files_dir, {db});

  const userManager = new UserManager(db);


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
    }, next);
  });

  
  /* istanbul ignore next */
  if (config.verbose) {
    let {default: morgan} = await import("morgan"); 
    //Requests logging is enabled only in dev mode as a proxy would handle it in production
    app.use(morgan(process.stdout.isTTY?"dev": "tiny", {
    }));
  }


  app.engine('.hbs', engine({
    extname: '.hbs',
  }));
  app.set('view engine', '.hbs');
  app.set('views', config.templates_dir);


  app.get(["/"], (req, res)=> res.redirect("/ui/"));

  /**
   * Set permissive cache-control for ui pages
   */
  app.use(["/ui", "/js", "/css", "/doc", "/language"], (req, res, next)=>{
    res.set("Cache-Control", `max-age=${30*60}, public`);
    next();
  });
  /**
   * Set even more permissive cache-control for static assets
   */
  app.use(["/images", "/fonts", "/favicon.png"], (req, res, next)=>{
    res.set("Cache-Control", `max-age=${60*60*24*30*12}, public`);
    next();
  });

  app.get("/ui/scenes/:scene/view", (req, res)=>{
    let {scene} = req.params;
    let {lang} = req.query;
    let host = getHost(req);
    let referrer = new URL(req.get("Referrer")||`/ui/scenes/`, host);
    let thumb = new URL(`/scenes/${encodeURIComponent(scene)}/scene-image-thumb.jpg`, host);

    res.render("explorer", {
      title: `${scene}: Explorer`,
      scene,
      thumb: thumb.toString(),
      referrer: referrer.toString(),
      lang: ((typeof lang === "string")?lang.toUpperCase():"FR"),
    });
  });

  app.get("/ui/scenes/:scene/edit",(req, res)=>{
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
      lang: ((typeof lang === "string")?lang.toUpperCase():"FR"),
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
      lang: ((typeof lang === "string")?lang.toUpperCase():"FR"),
    });
  });

  app.get(["/ui/", "/ui/*"],(req, res)=>{
    res.render("home", {
      title: "eCorpus",
      thumb: "/images/sketch_ethesaurus.png"
    });
  });

  /* istanbul ignore next */
  if(config.hot_reload){
    console.log("Hot reload enabled");
    const {default: webpack} = await import("webpack");
    const {default: middleware} = await import("webpack-dev-middleware");
    //@ts-ignore
    const {default: config} = await import("../ui/webpack.config.js");
    const compiler = webpack(config());
    const webpackInstance = middleware(compiler as any, {});
    app.use(webpackInstance);
    await new Promise(resolve=> webpackInstance.waitUntilValid(resolve));
  }else{
    // static file server
    app.use("/", express.static(config.dist_dir));
  }
  app.use("/", express.static(config.assets_dir));

  app.use("/libs", (await import("./routes/libs")).default);



  //Privilege-protected routes
  app.use("/scenes", (await import("./routes/scenes")).default);

  app.use("/api/v1", (await import("./routes/api/v1")).default);


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

    if(code === 401){
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

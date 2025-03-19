
import path from "path";
import util, { debuglog } from "util";

import cookieSession from "cookie-session";
import express, { Request, Response } from "express";


import UserManager from "../auth/UserManager.js";
import { BadRequestError, HTTPError, UnauthorizedError } from "../utils/errors.js";
import { errorHandlerMdw, LogLevel } from "../utils/errorHandler.js";
import { mkdir } from "fs/promises";

import {AppLocals, getHost, getLocals, getUser, getUserManager, isUser} from "../utils/locals.js";

import openDatabase from "../vfs/helpers/db.js";
import Vfs from "../vfs/index.js";
import defaultConfig from "../utils/config.js";
import User from "../auth/User.js";
import Templates from "../utils/templates.js";


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
    }, 6000).unref();

    /** @fixme remove once all databases are migrated */
    try{
      await vfs.fillHashes()
    }catch(e){
      console.error("Failed to fill-in missing hashsums in database. Application may be unstable.");
    }

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
    sessionMaxAge: 31 * 24 * 60 * 60*1000, // 1 month, in milliseconds
  }) as AppLocals;

  app.use(cookieSession({
    name: 'session',
    keys: await userManager.getKeys(),
    // Cookie Options
    maxAge: (app.locals as AppLocals).sessionMaxAge,
    sameSite: "strict"
  }));

  app.use("/", (req, res, next)=>{
    if(req.query.lang && (req.query.lang === "fr" || req.query.lang === "en")){
      req.session!.lang = req.query.lang;
    }
    next();
  })

  /**
   * Does authentication-related work like renewing and expiring session-cookies
   */
  app.use((req, res, next)=>{
    const {sessionMaxAge} = getLocals(req);
    const now = Date.now();
    if(req.session && !req.session.isNew){
      if(!req.session.expires || req.session.expires < now){
        req.session = null;
        return next(new UnauthorizedError(`Session Token expired. Please reauthenticate`));
      }else if(now < req.session.expires + sessionMaxAge*0.66){
        req.session.expires = now + sessionMaxAge;
      }
    }
    
    if(req.session?.uid) return next();
    
    let auth = req.get("Authorization");
    if(!auth) return next()
    else if(!auth.startsWith("Basic ") ||  auth.length <= "Basic ".length ) return next();
    let [username, password] = Buffer.from(auth.slice("Basic ".length), "base64").toString("utf-8").split(":");
    if(!username || !password) return next();
    getUserManager(req).getUserByNamePassword(username, password).then((user)=>{
      Object.assign(
        req.session as any,
        {expires: now + sessionMaxAge},
        User.safe(user),
      );
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

   //Ideally we would like a really long cache time for /dist but it requires unique filenames for each build
  //Allow CORS for assets that might get embedded
  app.use("/dist", (req, res, next)=>{
    res.set("Cache-Control", `max-age=${30*60}, public`);
    res.set("Access-Control-Allow-Origin", "*");
    next();
  });
  

  if(config.assets_dir){
    app.use("/dist", express.static(config.assets_dir));
  }

  // static file server
  app.use("/dist", express.static(config.dist_dir));

  app.use("/ui", (await import("./views/index.js")).default);

  //Privilege-protected routes
  app.use("/admin", (await import("./admin/index.js")).default);
  app.use("/auth", (await import("./auth/index.js")).default);
  app.use("/history", (await import("./history/index.js")).default);
  app.use("/scenes", (await import("./scenes/index.js")).default);
  app.use("/users", (await import("./users/index.js")).default);
  app.use("/tags", (await import("./tags/index.js")).default);
  

  /**
   * Redirects for previous routes under /api/v1 prefix
   * @fixme remove on next major release
   */
  app.use("/api/v1/:pathname(*)", util.deprecate((req :Request, res :Response, next)=>{
    const host = getHost(req);
    // Signal deprecation using the non-standard Deprecation header
    // https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-deprecation-header
    res.set("Deprecation", "@"+Math.round(new Date("2024-07-08T00:00:00.000Z").getTime()/1000).toString());
    //Expected sunset date, approximately
    res.set("Sunset", 'Wed, 01 Jan 2025 00:00:00 GMT');
    let pathname = req.params.pathname;
    if(/^\/log(?:in|out)/.test(pathname)){
      pathname = "/auth"+pathname;
    }else if(pathname.endsWith("history")){
      pathname = "/history"+pathname.replace("/scenes", "").replace("/history", "");
    }else if(pathname.endsWith("/permissions")){
      pathname = "/auth/access"+pathname.replace("/scenes", "").replace("/permissions", "");
    }
    const dest = new URL(pathname, host.origin);
    if(dest.origin != host.origin){
      throw new BadRequestError();
    }
    res.redirect(301, dest.pathname);
  }, `/api/v1 routes are deprecated. Use the new shorter naming scheme`));

  const logLevel = (config.verbose || debuglog("http:errors").enabled)?LogLevel.Verbose:LogLevel.InternalError;
  const isTTY = process.stderr.isTTY;

  // error handling
  //This should be last as it will match everything
  app.use((req, res)=>{
    //We don't just throw an error to be able to differentiate between
    //internally-thrown 404 and routes that doesn't exist in logs
    const error = { code:404, message: `Not Found`, reason: `No route was defined that could match "${req.method} ${req.originalUrl}"`}
    res.format({
      "application/json": ()=> {
        res.status(404).send(error)
      },
      "text/html": ()=>{
        res.status(404).render("error", { 
          error,
          lang: req.acceptsLanguages(["en", "fr"]),
          user: getUser(req),
        });
      },
      "text/plain": ()=>{
        res.status(404).send(error.message);
      },
      default: ()=> res.status(404).send(error.message),
    });
  });

  // istanbul ignore next
  //@ts-ignore
  app.use(errorHandlerMdw({isTTY, logLevel}));

  return app;
}

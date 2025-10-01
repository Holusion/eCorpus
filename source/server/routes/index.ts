
import path from "path";
import util, { debuglog } from "util";

import cookieSession from "cookie-session";
import express, { Request, Response } from "express";


import UserManager from "../auth/UserManager.js";
import { BadRequestError, HTTPError, UnauthorizedError } from "../utils/errors.js";
import { errorHandlerMdw, LogLevel, notFoundHandlerMdw } from "../utils/errorHandler.js";
import { mkdir } from "fs/promises";

import {AppLocals, AppParameters, getHost, getLocals, getUser, getUserManager, isUser} from "../utils/locals.js";

import openDatabase from "../vfs/helpers/db.js";
import Vfs from "../vfs/index.js";
import defaultConfig from "../utils/config.js";
import User from "../auth/User.js";
import Templates, { locales } from "../utils/templates.js";
import { TaskProcessor } from "../tasks/processor.js";
import { Client } from "pg";


const debug = debuglog("pg:connect");

export default async function createServer(locals:AppParameters) :Promise<express.Application>{

  const templates = new Templates({dir: locals.config.templates_dir, cache: locals.config.node_env == "production"});

  const app = express();
  app.disable('x-powered-by');
  app.set("trust proxy", locals.config.trust_proxy);


  app.locals  = Object.assign(app.locals, {
    sessionMaxAge: 31 * 24 * 60 * 60*1000, // 1 month, in milliseconds
    templates,
  }, locals) as AppLocals;

  app.use(cookieSession({
    name: 'session',
    keys: await locals.userManager.getKeys(),
    // Cookie Options
    maxAge: (app.locals as AppLocals).sessionMaxAge,
    sameSite: "lax"
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
  if (locals.config.verbose ||debuglog("http:requests").enabled) {
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
  

  if(locals.config.assets_dir){
    app.use("/dist", express.static(locals.config.assets_dir));
  }

  // static file server
  app.use("/dist", express.static(locals.config.dist_dir));

  app.use("/ui", (await import("./views/index.js")).default);

  //Privilege-protected routes
  app.use("/admin", (await import("./admin/index.js")).default);
  app.use("/auth", (await import("./auth/index.js")).default);
  app.use("/history", (await import("./history/index.js")).default);
  app.use("/scenes", (await import("./scenes/index.js")).default);
  app.use("/users", (await import("./users/index.js")).default);
  app.use("/tags", (await import("./tags/index.js")).default);
  app.use("/groups", (await import("./groups/index.js")).default);
  app.use("/services", (await import("./services/index.js")).default);
  
  const logLevel = (locals.config.verbose || debuglog("http:errors").enabled)?LogLevel.Verbose:LogLevel.InternalError;
  const isTTY = process.stderr.isTTY;

  // error handling
  //404: Not Found handler This should be last as it will match everything
  app.use(notFoundHandlerMdw());

  // istanbul ignore next
  //@ts-ignore
  app.use(errorHandlerMdw({isTTY, logLevel}));

  return app;
}

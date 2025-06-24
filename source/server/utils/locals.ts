
import e, { NextFunction, Request, RequestHandler, Response } from "express";
import {basename, dirname} from "path";
import User, { SafeUser, UserLevels } from "../auth/User.js";
import UserManager, { AccessType, AccessTypes, fromAccessLevel, toAccessLevel } from "../auth/UserManager.js";
import Vfs, { GetFileParams, Scene } from "../vfs/index.js";
import { BadRequestError, ForbiddenError, HTTPError, InternalError, NotFoundError, UnauthorizedError } from "./errors.js";
import Templates from "./templates.js";
import { Config } from "./config.js";

export interface AppLocals extends Record<string, any>{
  fileDir :string;
  userManager :UserManager;
  vfs :Vfs;
  templates :Templates;
  config: Config;
  /** Length of a session, in milliseconds since epoch */
  sessionMaxAge: number;
}

export function getLocals(req :Request){
  return req.app.locals as AppLocals;
}

export interface SessionData extends SafeUser{
  /** Expire date, in ms since epoch */
  expires?: number;
  lang?: "fr"|"en";
}

export function getSession(req :Request){
  return req.session as SessionData|null|undefined;
}

export function canonical(req :Request, ref :string) :URL{
  let host = getHost(req);
  return new URL(ref, host);
}
/**
 * @throws {InternalError} if app.locals.userManager is not defined for this request
 */
export function getUserManager(req :Request) :UserManager {
  let userManager :UserManager = getLocals(req).userManager;
  //istanbul ignore if
  if(!userManager) throw new InternalError("Badly configured app : userManager is not defined in app.locals");
  return userManager
}

export function getFileDir(req :Request) :string{
  let fileDir = getLocals(req).fileDir;
  if(!fileDir) throw new InternalError("Badly configured app : fileDir is not a valid string");
  return fileDir;
}

export function isUser(req: Request, res:Response, next :NextFunction){
  res.append("Cache-Control", "private");
  
  if((req.session as User).uid ) next();
  else next(new UnauthorizedError());
}

/**
 * Special case to allow user creation if no user exists in the database
 */
export function isAdministratorOrOpen(req: Request, res:Response, next :NextFunction){
  isAdministrator(req, res, (err)=>{
    if(!err) return next();
    Promise.resolve().then(async ()=>{
      let userManager = getUserManager(req);
      let users = (await userManager.getUsers());
      if(users.length == 0) return;
      else throw err;
    }).then(()=>next(), next);
  });
}
/**
 * Checks if user.isAdministrator is true
 * Not the same thing as canAdmin() that checks if the user has admin rights over a scene
 */
export function isAdministrator(req: Request, res:Response, next :NextFunction){
  res.append("Cache-Control", "private");
  
  if((req.session as User).level == "admin") next();
  else next(new UnauthorizedError());
}
/**
 * Wraps middlewares to find if at least one passes
 * Usefull for conditional rate-limiting
 * @example either(isAdministrator, isUser, rateLimit({...}))
 */
export function either(...handlers:Readonly<RequestHandler[]>) :RequestHandler{
  return (req, res, next)=>{
    let mdw = handlers[0];
    if(!mdw) return next(new UnauthorizedError());
    return mdw(req, res, (err)=>{
      if(!err) return next();
      else if (err instanceof UnauthorizedError) return either(...handlers.slice(1))(req, res, next);
      else return next(err);
    });
  }
}

/**
 * Generic internal permissions check
 * Caches result in `req.locals.access` so it's not a problem to apply a generic perms check
 * to a group of routes then more specific ACL checks for individual handlers
 */
function _perms(check:number,req :Request, res :Response, next :NextFunction){
  let {scene} = req.params;
  let {level = "create", uid = 0} = (req.session ??{})as SafeUser;
  if(!scene) throw new BadRequestError("no scene parameter in this request");
  if(check < 0 || AccessTypes.length <= check) throw new InternalError(`Bad permission level : ${check}`);

  res.set("Vary", "Cookie, Authorization");

  if(level == "admin"){
    res.locals.access = "admin" as AccessType;
    return next();
  }
  
  let userManager = getUserManager(req);
  (res.locals.access? 
    Promise.resolve(res.locals.access) :
    userManager.getAccessRights(scene, uid)
  ).then( access => {
    res.locals.access = access;
    const lvl = toAccessLevel(access);
    if(check <= lvl){
      next();
    } else if(req.method === "GET" || lvl <= toAccessLevel("none")){
      next(new NotFoundError(`Can't find scene ${scene}. It may be private or not exist entirely.`))
    } else {
      //User has insuficient level but can read the scene
      next(new UnauthorizedError(`user does not have ${fromAccessLevel(check)} rights on ${scene}`));
    }
  }, next);
}

/**
 * Check user read access over a scene
 */
export const canRead = _perms.bind(null, toAccessLevel("read"));
/**
 * Check user write access over a scene
 */
export const canWrite = _perms.bind(null, toAccessLevel("write"));
/**
 * Check user administrative access over a scene
 */
export const canAdmin = _perms.bind(null, toAccessLevel("admin"));

export function getUser(req :Request){
  return {
    username: "default",
    uid: 0,
    level: "none",
    ...req.session,
  } as SafeUser;
}

export function getUserId(req :Request){
  return getUser(req).uid;
}

export function getFileParams(req :Request):GetFileParams{
  let {scene, name} = req.params;
  if(!scene) throw new BadRequestError(`Scene parameter not provided`);
  if(!name) throw new BadRequestError(`File parameter not provided`);

  return {scene, name};
}

export function getVfs(req :Request){
  let vfs :Vfs = getLocals(req).vfs;
  //istanbul ignore if
  if(!vfs) throw new InternalError("Badly configured app : vfs is not defined in app.locals");
  return vfs;
}

export function getHost(req :Request) :URL{
  let host = (req.app.get("trust proxy")? req.get("X-Forwarded-Host") : null) ?? req.get("Host");
  return new URL(`${req.protocol}://${host}`);
}

/**
 * Validates if a requested redirect URL would be within the current origin
 * Also make the URL canonical (http://example.com/foo)
 */
export function validateRedirect(req :Request, redirect :string|any):string{
  let host = getHost(req);
  try{
    let target = new URL(redirect, host);
    if(target.origin !== host.origin) throw new BadRequestError(`Redirect origin mismatch`);
    return target.toString();
  }catch(e){
    throw new BadRequestError(`Bad Redirect parameter`);
  }

}
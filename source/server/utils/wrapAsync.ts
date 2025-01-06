'use strict';

import { Request, RequestHandler, Response, NextFunction } from "express";

interface AsyncRequestHandler{
  (
    req: Request,
    res:  Response,
  ) :Promise<any>;
};
/**
 * Wraps an async function to pass errors to next()
 * It's slightly convoluted to try to keep a proper name to the handler.
 * A simpler version would be `return (req, res next)=>handler(req, res).catch(next);`
 * @returns 
 */
export default function wrap(handler :AsyncRequestHandler):RequestHandler {
  let name = (typeof handler.prototype =="object")? handler.name: "anonymousHandler";
  return new Function(
    "handler",
    `return function ${name} (req, res, next) { Promise.resolve(handler(req, res)).catch(next)};`
  )(handler);
}

/**
 * Asynchronous wrapper around Response.format().
 * @see Response.format()
 * 
 * Additionally, allows the use of req.query.format for unambiguous cases
 */
export async function wrapFormat(res :Response, handlers :Record<string,()=>Promise<any>|any>) :Promise<any>{
  let p :()=>Promise<void>;
  let {format} = res.req.query;
  if(format == "zip" && handlers["application/zip"]){
    res.set("Content-Type", "application/zip");
    return await handlers["application/zip"]();
  }else if(format =="json" &&handlers["application/json"]){
    res.set("Content-Type", "application/json; encoding=utf-8");
    return await handlers["application/json"]();
  }else if(format == "text" && handlers["text/plain"] ){
    res.set("Content-Type", "text/plain; encoding=utf-8");
    return await handlers["text/plain"]();
  }
  
  res.format(Object.entries(handlers).reduce((h, [type, handler])=>{
    return {...h, [type]:()=>{
      p = handler;
    }}
  }, {}));
  //@ts-ignore (we know p will be assigned in res.format)
  return await p();
}

/**
 * Collapse an async generator into an array
 */
export async function collapseAsync<T>(gen:AsyncGenerator<T>):Promise<T[]>{
  let results :T[]= [];
  for await (let item of gen){
    results.push(item);
  } 
  return results;
}
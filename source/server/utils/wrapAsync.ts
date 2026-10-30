'use strict';

import { Response } from "express";

/**
 * Asynchronous wrapper around Response.format().
 * @see Response.format()
 * 
 * Additionally, allows the use of req.query.format for unambiguous cases
 */
export async function wrapFormat(res :Response, handlers :Record<string,()=>Promise<any>|any>) :Promise<any>{
  const handler_entries = Object.entries(handlers);
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
  
  res.format(handler_entries.reduce((h, [type, handler])=>{
    return {...h, [type]:()=>{
      p = handler;
    }}
  }, {}));
  //@ts-ignore (we know p will be assigned in res.format)
  if(!p){
    return Promise.resolve();
  }
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
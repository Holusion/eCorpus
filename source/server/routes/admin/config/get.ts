import { Request, Response } from "express";
import { getLocals, getVfs } from "../../../utils/locals.js";



export default async function handleGetConfig(req :Request, res :Response){
  let {config} = getLocals(req);
  res.status(200)
  res.format({
    "application/json": ()=>{
      res.send(Object.fromEntries(config));
    },
    "text/plain": ()=>{
      res.send(Array.from(config).map(([key, entry])=>{
        return `${key.toUpperCase()}="${entry.value}"`
      }).join("\n"));
    }
  })
}
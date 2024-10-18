import { Request, Response } from "express";
import { getLocals, getVfs } from "../../../utils/locals.js";



export default async function handleGetConfig(req :Request, res :Response){
  let {config} = getLocals(req);
  res.status(200)
  res.format({
    "application/json": ()=>{
      res.send(config);
    },
    "text/plain": ()=>{
      res.send(Object.entries(config).map(([key, value])=>{
        return `${key.toUpperCase()}="${value}"`
      }).join("\n"));
    }
  })
}
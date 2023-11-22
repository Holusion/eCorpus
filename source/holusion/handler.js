'use strict';
const https = require("https");
const fs = require("fs/promises");
const path = require('path');
const {pipeline} = require('stream/promises');
const express = require('express');
const DataCache = require("./data");
const {forward, request, drain, pipe} = require("./forward");
const { debug } = require("./debug");

const isProduction = process.env["NODE_ENV"] !== "development";

/**
 * @typedef {(req : import("express").Request, res :import("express").Response)=>Promise<any>} AsyncRequestHandler
 */

/**
 * 
 * @param {AsyncRequestHandler} handler 
 * @returns 
 */
function wrap(handler){
  return (req, res, next)=> Promise.resolve(handler(req, res)).catch(next);
}

/**
 * @param {express.Request} req
 * @returns {DataCache}
 */
function getDataCache(req){
  return req.app.locals.dataCache;
}


const handler = express();
// FIXME : cache-control when in production
handler.get("/", (req, res)=>res.sendFile(path.resolve(__dirname, "../../dist/voyager-split.html")));
handler.get("/scene", (req, res)=>res.sendFile(path.resolve(__dirname, "../../dist/voyager-split.html")));

handler.use("/client", express.static(path.resolve(__dirname, "client")));


handler.get("/scenes/*", wrap(async (req, res)=>{
  let dataCache = getDataCache(req);
  debug(`[${req.method}] ${req.path}`);
  let file = decodeURIComponent(req.path.slice(1));
  try{
    let stream = await dataCache.get(file);
    //@ts-ignore - Zip stream does have a length */
    res.set("Content-Length", stream.length);
    res.status(200);
    stream.pipe(res);
  }catch(e){
    if(/Entry not found/.test(e.message)){
      console.log("Zip entry %s not found ", file);
      return res.status(404).send("Not Found");
    }else{
      console.log("Zip error for %s: ", file, e);
      res.status(500).send(e.message);
    }
  }
}));

handler.get("/documents.json", wrap(async (req, res)=>{
  let dataCache = getDataCache(req);
  let scenes = await dataCache.getScenes();
  res.status(200).send({documents: Object.values(scenes)});
}));


handler.get("/files/list", wrap(async (req, res)=>{
  let dir = process.env["MEDIA_FOLDER"] || "/media/usb";
  let files = [];
  try{
    files = await fs.readdir(dir);
  }catch(e){
    if(e.code !=="ENOENT") throw e;
    console.warn("Can't find directory "+dir);
  }
  let zipFiles = files.filter(f=> f.toLowerCase().endsWith(".zip"));
  res.set("Content-Type", "application/json");
  res.status(200).send(zipFiles);
}));

handler.post("/files/copy/:filename", wrap(async (req, res)=>{
  let dataCache = getDataCache(req);
  let dir = process.env["MEDIA_FOLDER"] || "/media/usb";
  let file = path.join(dir, req.params.filename);
  await dataCache.copy(file);
  res.status(204).send();
}));


handler.get("/remote/:path(*)", wrap(async (req, res)=>{
  let dataCache = getDataCache(req);
  const {cookies, upstream} = await dataCache.getState();
  let proxyRes = await forward({
    upstream: upstream,
    path: "/"+encodeURI(req.params.path),
    method: "GET",
    headers: {
      "Cookie": cookies,
      "Connection": req.headers["connection"],
      "Accept": req.headers["accept"],
      "Accept-Language": req.headers["accept-language"],
      "Accept-Encoding": req.headers["accept-encoding"],
      "User-Agent": req.headers["user-agent"],
    }
  });
  proxyRes.pipe(res);
}));

/**
 * Fetch accessible remote scenes
 */
handler.get("/files/fetch", wrap(async (req, res)=>{
  let dataCache = getDataCache(req);
  const {cookies, upstream} = await dataCache.getState();
  let proxyRes = await forward({
    upstream,
    path: "/api/v1/scenes",
    method: "GET",
    headers: {
      "Accept": "application/json",
      "Cookie": cookies,
    }
  });
  pipe(proxyRes, res);
}));

/**
 * Download a set of file
 * Forwards the query params to upstream
 */
handler.get("/files/download", wrap(async(req, res) => {
  let dataCache = getDataCache(req);
  let query = req.originalUrl.split("?")[1] ?? "";

  let {cookies, etag, upstream} = await dataCache.getState();
  let headers = {
    "Accept": "application/zip",
  };
  if(cookies) headers["Cookie"] = cookies;
  if(etag) headers["If-None-Match"] = etag;

  let proxyRes = await forward({
    upstream,
    path: `/api/v1/scenes?${query}`,
    method: "GET",
    headers
  });

  if(proxyRes.statusCode == 304) {

    console.log("Current zip is up to date");
    proxyRes.destroy();
    res.status(304).send();

  }else if(proxyRes.statusCode != 200){

    let {text, json} = await drain(proxyRes);
    console.log("Failed to download scenes with query : \"%s\":", query, json || text );
    res.status(proxyRes.statusCode);
    res.set("Content-Type", proxyRes.headers["content-type"]);
    res.set("Content-Length", proxyRes.headers["content-length"]);
    res.send(text);
  }else if(!proxyRes.headers["content-type"].startsWith("application/zip")){

    let {text} = await drain(proxyRes, 500);
    console.log("Failed to download scenes. Returned content-type : \"%s\".", proxyRes.headers["content-type"], text );
    res.status(500);
    res.send({code: 500, message: "Bad content-type from eCorpus : "+proxyRes.headers["content-type"]});
    
  }else{

    console.log("New update :", new Date(proxyRes.headers["last-modified"]).toUTCString());
  
    let destFile = dataCache.mktemp();
    let rs = await fs.open(destFile, "w");
    await pipeline(
      proxyRes,
      rs.createWriteStream(),
    );
    await dataCache.rename(destFile, proxyRes.headers["etag"]);
    res.status(201).send();
  }
}))


handler.get("/login", wrap(async (req, res)=>{
  const dataCache = getDataCache(req);
  const state = await dataCache.getState();
  let r = await request({
    upstream: state.upstream,
    path: "/api/v1/login",
    method: "GET",
    headers:{
      "Content-Type":"application/json",
      "Accept": "application/json",
      "Cookie": state.cookies,
    },
  });
  let cookies = r.headers["set-cookie"]?.map(c=>c.split(";")[0]);
  if(cookies?.length){
    console.log("Save new login cookies");
    await dataCache.setState({cookies});
  }
  res.set("Content-Type", r.headers["content-type"]);
  res.status(r.statusCode).send((r.json? JSON.stringify({...r.json, upstream: state.upstream }): r.text));
}));

/**
 * This is slightly convoluted. We could store user credentials indefinitely instead but it creates a security risk.
 */
handler.post("/login", wrap(async (req, res)=>{
  let dataCache = getDataCache(req);
  let {username, password, upstream:upstreamQ} = req.query;
  const upstream = new URL((typeof upstreamQ === "string" && upstreamQ)? upstreamQ: undefined);

  let data = JSON.stringify({
    username,
    password,
  });
  
  let r = await request({
    upstream,
    path: "/api/v1/login",
    method: "POST",
    headers:{
      "Content-Type":"application/json",
      "Accept": "application/json",
      "Content-Length": Buffer.byteLength(data),
    },
     body: data
  });

  if(r.statusCode === 200){
    console.log("Save new login cookies");
    let cookies = r.headers["set-cookie"].map(c=>c.split(";")[0]);
    await dataCache.setState({
      cookies,
      upstream: upstream.toString()
    });
  }
  
  res.set("Content-Type", r.headers["content-type"]);
  return res.status(r.statusCode).send(r.text);
}));

handler.post("/logout", wrap(async (req, res)=>{
  let dataCache = getDataCache(req);
  await dataCache.setState({cookies:""});
  res.status(201).send();
}));

handler.use(express.static(path.resolve(__dirname, "assets")));
handler.use(express.static(path.resolve(__dirname, "../../assets")));
handler.use(express.static(path.resolve(__dirname, "../../dist")));

handler.use("/libs/three", express.static(path.join(__dirname, "node_modules/three/build")));

// error handling
handler.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) {
      return next(error);
  }
  res.format({
    "text/plain":()=>{
      res.status(500).send(error.message);
    },
    "application/json": ()=>{
      res.status(500).send({
        code: 500,
        message: error.message,
      });
    }
  })
});

handler.use(function(req, res) {
  let msg = `Cannot ${req.method} ${req.path}`;
  console.log(msg);
  res.format({
    "text/plain":()=>{
      res.status(404).send(msg);
    },
    "application/json": ()=>{
      res.status(404).send({
        code: 404,
        message: msg,
      });
    }
  })
});

module.exports = async function handle({port=0, zip}){
  let dataCache = await DataCache.Open(zip);
  handler.locals.dataCache = dataCache;
  return await new Promise(resolve=>{
    let server = handler.listen(port, ()=>resolve(server));
  });
};
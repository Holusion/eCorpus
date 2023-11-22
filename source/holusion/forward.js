const https = require('https');
const http = require('http');
const {once} = require("events");


const {debug} = require("./debug");

const upstream = new URL("https://ecorpus.holusion.com");

/**
 * @typedef {object} ForwardTarget
 * @property {string|URL} upstream
 * @property {"GET"|"POST"|"PUT"|"DELETE"} method
 * @property {string} path
 * @property {number} [timeout=2000]
 * @property {https.RequestOptions["headers"]} [headers]
 * @property {string} [body]
 */

/**
 * Simplified request forwarding.
 * @param {ForwardTarget} to 
 * @return {Promise<import("http").IncomingMessage>}
 */

async function forward(to){
  const upstream = new URL(to.path, to.upstream || "https://ecorpus.holusion.com");
  debug(`Forward [${to.method}] ${upstream.toString()}`)
  let headers = to.headers ?? {};
  let req = (upstream.protocol === "http:"? http : https).request(upstream, {
    ...to,
    headers: {
      "Content-Length": to.body? Buffer.byteLength(to.body): 0,
      ...headers,
    },
    timeout: to.timeout || 2000,
  });
  if(to.body) req.write(to.body);
  req.end();
  /**@type {[import("http").IncomingMessage]} 
   * @ts-ignore*/
  let [res] = await once(req, "response", {signal: to.signal });
  if(res.statusCode == 301 || res.statusCode == 302){
    let dest = new URL(res.headers.location);
    if(dest.hostname == upstream.hostname && dest.pathname == to.path){
      throw new Error(`Bad redirect location : ${res.headers.location}`);
    }
    return await forward({...to, upstream: dest, path: dest.pathname})
  }
  return res;
}
/**
 * Like stream.pipe but copies headers and status code.
 * @param {Awaited<ReturnType<typeof forward>>} from 
 * @param {import("express").Response & import("node:stream").Writable} to 
 */
async function pipe(from, to){
  for(let header in from.headers){
    to.set(header, from.headers[header]);
  }
  to.status(from.statusCode);
  from.pipe(to);
}


/**
 * Drains a request into a string and JSON (if content-type matches)
 * @param {import("http").IncomingMessage} res
 * @param {number} [limit=0] max allowed string length in bytes. 0 for unlimited
 * @return  {Promise<import("http").IncomingMessage & {text:string, json:any, error:Error|null}>}
 */
async function drain(res, limit=0){
  let text = "", size=0, error = null;
  res.setEncoding("utf8");
  for await (let d of res){
    if(0 < limit){
      size += d.length;
      if(limit < size ){
        text = text.slice(0, -11) + "[truncated]";
        error = new Error("Body limit reached");
      }
    }
    text += d;
  }
  let json = {};
  if(res.headers["content-type"].startsWith("application/json") && !error){
    try{
      json = JSON.parse(text);
    }catch(e){
      error = e;
    }
  }

  return Object.assign(res, {
    text, 
    json,
    error
  });
}

/**
 * Simplified request forwarding : auto drain responses
 * @param {ForwardTarget} to 
 * @return {Promise<import("http").IncomingMessage & {text:string, json:any}>}
 */
async function request(to){
  let r = await forward(to);
  return await drain(r);
}


module.exports = {
  forward,
  drain,
  pipe,
  request
}
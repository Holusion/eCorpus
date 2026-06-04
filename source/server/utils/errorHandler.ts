import { Request, Response, NextFunction } from "express";
import { HTTPError } from "./errors.js";
import { getUser, useTemplateProperties } from "./locals.js";
import { locales } from "./templates/index.js";
import { createLogger } from "./log/index.js";

const log = createLogger("http");


export function errorHandlerMdw(){
  return function errorHandler(error:HTTPError|Error, req:Request, res:Response, next:NextFunction){

    const code = (error instanceof HTTPError )? error.code : 500;

    if (res.headersSent) {
      req.socket.destroy();
      log.warn({ err: error, method: req.method, url: req.originalUrl }, "An error happened after headers were sent");
      return;
    }

    // Severity follows the HTTP status: 5xx are genuine server faults, 4xx are
    // routine client errors. Operators tune visibility through the logger's
    // own level (LOG_LEVEL) rather than a bespoke switch here.
    if(code >= 500) log.error({ err: error }, error.message);
    else log.debug({ err: error }, error.message);

    if(code === 401
    //We try to NOT send the header for browser requests because we prefer the HTML login to the browser's popup
      //Browser tends to prefer text/html and always send Mozilla/5.0 at the beginning of their user-agent
      //If someone has customized their headers, they'll get the ugly popup and live with it.
      && !(req.get("Accept")?.startsWith("text/html") && req.get("User-Agent")?.startsWith("Mozilla"))
      //Also don't apply it for login route because it doesn't make any sense.
      && req.path !== "/auth/login"
      //&& !req.get("Authorization")
    ){
      res.set("WWW-Authenticate", "Basic realm=\"authenticated access\"");
    }

    res.format({
      "application/json": ()=> {
        res.status(code).send({ code, message: `${error.name}: ${error.message}` })
      },
      "text/html": ()=>{
        // send error page
        useTemplateProperties(req, res, ()=>{
          res.status(code).render("error", { 
            error,
          });
        });
      },
      "text/plain": ()=>{
        res.status(code).send(error.message);
      },
      default: ()=> res.status(code).set("Content-Type", "text/plain; charset=utf-8").send(error.message),
    });
  }
}


export function notFoundHandlerMdw(){
  return function notFoundHandler(req:Request, res:Response){
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
          lang: req.acceptsLanguages(locales),
          user: getUser(req),
        });
      },
      "text/plain": ()=>{
        res.status(404).send(error.message);
      },
      default: ()=> res.status(404).set("Content-Type", "text/plain; charset=utf-8").send(error.message),
    });
  }
}
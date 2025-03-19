import util from "node:util";
import { Request, Response, NextFunction } from "express";
import { useTemplateProperties } from "../routes/views/index.js";
import { HTTPError } from "./errors.js";


export enum LogLevel{
  /** Print nothing to the console */
  Quiet = 0,
  /**Only print uncategorized or Internal (5xx) errors */
  InternalError = 1,
  /**print a log on each error, even routine ones */
  Verbose = 2,
}

interface ErrorHandlerOptions{
  /** is stdout is a TTY, we print the full error, with stack trace. If not we try to shorten and collapse it */
  isTTY:boolean;
  logLevel: number;
}

/** uses util.inspect with compact settings to print manageable stack traces */
function compactError(error:Error):string{
  return util.inspect(error, {
    compact: 3,
    breakLength: Infinity,
  }).replace(/\n/g,"\\n")
}


export function errorHandlerMdw({
  isTTY,
  logLevel = LogLevel.InternalError,
}: ErrorHandlerOptions){
  return (error:HTTPError|Error, req:Request, res:Response, next:NextFunction) => {

    if (res.headersSent) {
      req.socket.destroy();
      if(logLevel != LogLevel.Quiet) console.warn("An error happened after headers were sent for %s %s", req.method, req.originalUrl, compactError(error));
      return;
    }
    
    if(LogLevel.Verbose <= logLevel) {
      console.error((isTTY ? error : compactError(error)));
    }else if(LogLevel.InternalError <= logLevel && (!("code" in error) || error.code === 500)){
      console.error("Internal error", error.message);
    }
    

    let code = (error instanceof HTTPError )? error.code : 500;

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
      default: ()=> res.status(code).send(error.message),
    });
  }
}

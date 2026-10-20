import { Request, Response, NextFunction } from "express";
import { HTTPError } from "./errors.js";
import { getLanguage, getUser, useTemplateProperties } from "./locals.js";
import { createLogger } from "./log/index.js";
import { translateErrorMessage } from "./i18n.js";

const log = createLogger("http");

/**
 * Whether the client hung up before we could answer it.
 *
 * Deliberately keyed on the state of the connection rather than on `error.code`:
 * node reports an interrupted upload as `ECONNRESET`, but so does a dropped
 * connection to postgres or to the mail relay, and those *are* server faults that
 * must keep their 500. What sets a client disconnect apart is that there is no
 * longer anyone to respond to.
 *
 * `res.destroyed` covers both directions — an upload cut off mid-body and a
 * response the client stopped reading. `req.destroyed && !req.complete` is the
 * belt-and-braces case of an incoming message torn down before the response
 * object caught up.
 */
function isClientDisconnect(req:Request, res:Response):boolean{
  return res.destroyed || (req.destroyed && !req.complete);
}

/**
 * Translates a {@link localize}d error's message to the language pages would be rendered in.
 * Other errors keep their (english) message
 */
function localizedMessage(error:HTTPError|Error, req:Request, res:Response):string{
  if(!(error instanceof HTTPError && error.i18n)) return error.message;
  res.vary("Accept-Language");
  const lng = getLanguage(req);
  res.set("Content-Language", lng);
  return translateErrorMessage(error, lng);
}

export function errorHandlerMdw(){
  return function errorHandler(error:HTTPError|Error, req:Request, res:Response, next:NextFunction){

    const code = (error instanceof HTTPError )? error.code : 500;

    if (isClientDisconnect(req, res)) {
      // Checked before `res.headersSent`, which is still false when an upload is
      // aborted: without this we'd log a routine disconnect as a server fault and
      // then write a response onto a socket that is already gone.
      log.debug({ err: error, method: req.method, url: req.originalUrl }, "Client disconnected before a response was sent");
      return;
    }

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
    //Advertise the token scheme, not Basic: the server no longer accepts
    //user passwords in an Authorization header (see utils/authenticate.ts),
    //so a Basic challenge would send clients down a path that always fails.
    //We still steer browsers to the HTML login rather than the header — they
    //prefer text/html and start their user-agent with Mozilla/5.0.
    //If someone has customized their headers, they'll get the challenge and live with it.
      && !(req.get("Accept")?.startsWith("text/html") && req.get("User-Agent")?.startsWith("Mozilla"))
      //Also don't apply it for login route because it doesn't make any sense.
      && req.path !== "/auth/login"
      //&& !req.get("Authorization")
    ){
      res.set("WWW-Authenticate", "Bearer realm=\"authenticated access\"");
    }

    const message = localizedMessage(error, req, res);
    res.format({
      "application/json": ()=> {
        res.status(code).send({ code, message: `${error.name}: ${message}` })
      },
      "text/html": ()=>{
        // send error page
        useTemplateProperties(req, res, ()=>{
          res.status(code).render("error", { 
            // message and stack are not enumerable
            error: { ...error, message, stack: error.stack },
          });
        });
      },
      "text/plain": ()=>{
        res.status(code).send(message);
      },
      default: ()=> res.status(code).set("Content-Type", "text/plain; charset=utf-8").send(message),
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
          lang: getLanguage(req),
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
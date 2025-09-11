import { createHmac } from "crypto";
import { NextFunction, Request, RequestHandler, Response } from "express";
import User, { SafeUser } from "../../auth/User.js";
import { BadRequestError, ForbiddenError, HTTPError, NotFoundError, UnauthorizedError } from "../../utils/errors.js";
import { AppLocals, getHost, getLocals, getSession, getUser, getUserManager, validateRedirect } from "../../utils/locals.js";
import sendmail from "../../utils/mails/send.js";
import { useTemplateProperties } from "../views/index.js";

/**
 * Handler for login flow. Used for automated AND interactive login flows, which makes it a bit more complicated
 * Due to this, it handles (most of) its own errors contrary to most handlers. 
 */
export function postLogin(req :Request, res :Response, next :NextFunction){
  const {sessionMaxAge} = getLocals(req);
  let userManager = getUserManager(req);
  let {redirect} = req.query;
  let {username, password} = req.body;

  if(!username) throw new BadRequestError("Username not provided");
  else if(typeof username !="string") throw new BadRequestError("Bad username format");
  if(!password) throw new BadRequestError("Password not provided");
  else if(typeof password !="string") throw new BadRequestError("Bad password format");

  userManager.getUserByNamePassword(username, password).then(user=>{
    let safeUser = User.safe(user);
    Object.assign(
      (req as any).session as any,
      {expires: Date.now() + sessionMaxAge},
      safeUser
    );
    return safeUser;
  }).then((safeUser)=>{
    if(redirect && typeof redirect === "string"){
      return res.redirect(302, validateRedirect(req, redirect).toString());
    }else{
      res.format({
        "application/json": ()=> {
          res.status(200).send(safeUser);
        },
        "text/html": ()=>{
          res.redirect(302, "/ui/");
        },
        "text/plain": ()=>{
          res.status(200).send(`${safeUser.username} (${safeUser.uid})`);
        },
      });
    }

  }, (e)=>{
    if(e instanceof NotFoundError){
      e = new UnauthorizedError(`Username not found`);
    }
    const code :number = e.code ?? 500;
    const rawMessage = (e instanceof HTTPError)? e.message.slice(6): e.message;
    res.status(code);

    res.format({
      "application/json": ()=> {
        res.status(200).send({ code, message: `${e.name}: ${e.message}` });
      },
      "text/html": ()=>{
        res.render("login", {
          error: rawMessage,
        });
      },
      "text/plain": ()=>{
        res.status(code).send(e.message);
      },
    });
  }).catch(next);
}

export async function getLogin(req :Request, res:Response){
  let requester = getUser(req);
  let { redirect:unsafeRedirect} = req.query;
  let host = getHost(req);

  const redirect = unsafeRedirect? validateRedirect(req, unsafeRedirect): undefined;
  const session = getSession(req);
  res.format({
    "application/json": ()=> {
      res.status(200).send(User.safe(session ?? {}));
    },
    "text/html": ()=>{
      if(requester && requester.level !== "none") return res.redirect(302, redirect ?redirect.pathname: "/ui/");
      useTemplateProperties(req, res, ()=>{
        res.render("login", {
          title: "eCorpus Login",
          user: null,
          redirect,
        });
      });
    },
    "text/plain": ()=>{
      res.status(200).send(`${session?.username} (${session?.uid})`);
    },
  });
};


export async function getLoginPayload(req: Request, res: Response){
  const {payload} = req.params;

  let userManager = getUserManager(req);

  let keys = (await userManager.getKeys());

  const params = parseLoginPayload(keys, payload);
  //Even though redirect should come from the signet JSON payload, we still should validate it, just in case...
  const redirect = validateRedirect(req, params.redirect ?? "/ui/");

  //Verify data is valid. First, expiration date
  if(!params.expires || !Number.isInteger(params.expires)) throw new BadRequestError("Bad token payload");
  else if(params.expires < Date.now()) throw new ForbiddenError("Token expired");
  //Then verify the user has not been deleted or renamed
  let user;
  try{
    user = await userManager.getUserByName(params.username);
    if(user.uid != params.uid) throw new Error("uid mismatch");
  }catch(e){
    throw new BadRequestError(`Failed to parse login payload`);
  }

  //Assign user sessing accordingly
  Object.assign(
    (req as any).session as any,
    {expires: Date.now() + getLocals(req).sessionMaxAge },
    User.safe(user),
  );

  return res.redirect(302, redirect.toString());
}


interface LoginParams {
  uid: number;
  username: string;
  expires :number;
  redirect?:string;
}

/**
 * Makes an authenticated link with embedded redirect
 * @param key 
 * @param param1 
 * @param redirect 
 * @returns 
 */
export function makeRedirect(key:string, {user, expiresIn, redirect}:{user:Pick<User,"uid"|"username">, expiresIn:number, redirect :URL}) :URL{
  let expires = new Date(Date.now()+ expiresIn).valueOf();
  let url = new URL(`/auth/payload/${formatLoginPayload(key, {uid: user.uid, username: user.username, expires, redirect: redirect.pathname})}`, redirect);
  return url;
}

/**
 * Parse a formatted login payload. Verify its signature and return the original parameter object
 * Will throw {@link BadRequestError} if payload is invalid, or {@link ForbiddenError} if signature doesn't match
 * @param payload 
 */
export function parseLoginPayload(keys: string[], payload: string) :LoginParams{
  const parts = payload.split(".");
  if(parts.length != 2){
    throw new BadRequestError(`Bad login links parameters`);
  }
  const [sig, data] = parts;
  if(!data || !sig){
    throw new BadRequestError(`Bad login links parameters`);
  }
  if(!keys.some((key)=>{
    return createHmac("sha512", key).update(data).digest("base64url") === sig;
  })){
    throw new ForbiddenError("payload doesn't match signature");
  }
  return JSON.parse(Buffer.from(data, "base64url").toString("utf-8"));
}

/**
 * 
 * @param key 
 * @param params 
 * @returns "<base64url-encoded signature>.<base64url-encoded parameters>""
 */
export function formatLoginPayload(key: string, params:Readonly<LoginParams>): string{
  const data = Buffer.from(JSON.stringify(params)).toString("base64url");
  const sig = createHmac("sha512", key).update(data).digest("base64url");
  return `${sig}.${data}`;
}

export async function getLoginLink(req :Request, res :Response){
  let {sessionMaxAge} = getLocals(req);
  let {username} = req.params;
  let {redirect:unsafeRedirect} = req.query
  let userManager = getUserManager(req);
  let user = await userManager.getUserByName(username);
  let key = (await userManager.getKeys())[0];
  const redirect = validateRedirect(req, ((typeof unsafeRedirect === "string")?unsafeRedirect:"/ui/"));

  res.format({
    "text/plain":()=>{
      res.status(200).send(makeRedirect(key, {user, expiresIn: sessionMaxAge, redirect}).toString());
    }
  });
}


export async function sendLoginLink(req :Request, res :Response){
  let {sessionMaxAge} = getLocals(req);
  let {username} = req.params;
  let userManager = getUserManager(req);

  let user = await userManager.getUserByName(username);
  if(!user.email){
    throw new BadRequestError(`Requested user has no registered email`);
  }
  let key = (await userManager.getKeys())[0];
  let link = makeRedirect(
    key,
    {user, expiresIn: sessionMaxAge, redirect: getHost(req)}, 
  );

  let lang = "fr";
  const mail_content = await getLocals(req).templates.render(`emails/connection_${lang}`, {
    layout: null,
    name: user.username,
    lang: "fr",
    url: link.toString()
  });
  await sendmail({
    to: user.email,
    subject: "Votre lien de connexion à eCorpus",
    html: mail_content,
  });
  
  console.log("sent an account recovery mail to :", user.email);
  res.status(204).send();
}

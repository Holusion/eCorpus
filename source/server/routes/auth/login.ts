import { createHmac } from "crypto";
import { Request, RequestHandler, Response } from "express";
import User, { SafeUser } from "../../auth/User.js";
import { BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError } from "../../utils/errors.js";
import { AppLocals, getHost, getLocals, getUser, getUserManager } from "../../utils/locals.js";
import sendmail from "../../utils/mails/send.js";
/**
 * 
 * @type {RequestHandler}
 */
export const postLogin :RequestHandler = (req, res, next)=>{
  let userManager = getUserManager(req);
  let {username,password} = req.body;
  if(!username) throw new BadRequestError("username not provided");
  if(!password) throw new BadRequestError("password not provided");
  userManager.getUserByNamePassword(username, password).then(user=>{
    let safeUser = User.safe(user);
    Object.assign((req as any).session as any, safeUser);
    res.status(200).send({...safeUser, code: 200, message: "OK"});

  }, (e)=>{
    if(e instanceof NotFoundError){
      next(new UnauthorizedError(`username ${username} not found`));
    }else{
      next(e);
    }
  });
};

export async function getLogin(req :Request, res:Response){
  let {payload, sig, redirect} = req.query;
  if(typeof payload !== "string" || !payload || !sig){
    return res.status(200).send(User.safe((req as any).session as any));
  }

  let userManager = getUserManager(req);

  let keys = (await userManager.getKeys());

  if(!keys.some((key)=>{
    return createHmac("sha512", key).update(payload as string).digest("base64url") === sig;
  })){
    throw new ForbiddenError();
  }

  let user;
  try{
    let s = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
    user = await userManager.getUserByName(s.username);
    if(user.uid != s.uid) throw new Error("uid mismatch");
    if(new Date(s.expires).valueOf() < new Date().valueOf()) throw new Error("Token expired");
  }catch(e){
    console.log((e as any).message);
    throw new BadRequestError(`Failed to parse login payload`);
  }
  Object.assign((req as any).session as any, User.safe(user));
  if(redirect && typeof redirect === "string"){
    return res.redirect(302, redirect );
  }
  res.status(204).send();
};


function makeLoginLink(user :User, key :string){
  let expires = new Date(Date.now()+ 1000*60*60*24*30); //1 month
  let params = Buffer.from(JSON.stringify({
    uid: user.uid.toString(10),
    username: user.username,
    expires: expires.toISOString(),
  })).toString("base64url");

  let sig = createHmac("sha512", key).update(params).digest("base64url");

  return {
    params,
    expires,
    sig,
  };
}

function makeRedirect(opts:ReturnType<typeof makeLoginLink>, redirect :URL) :URL{
  let url = new URL("/auth/login", redirect.toString());
  url.searchParams.set("payload", opts.params);
  url.searchParams.set("sig", opts.sig);
  url.searchParams.set("redirect", redirect.pathname);
  return url;
}


export async function getLoginLink(req :Request, res :Response){
  let {username} = req.params;
  let userManager = getUserManager(req);
  let user = await userManager.getUserByName(username);
  let key = (await userManager.getKeys())[0];

  let payload = makeLoginLink(user, key);
  res.format({
    "text/plain":()=>{
      let rootUrl = getHost(req);
      res.status(200).send(makeRedirect(payload, rootUrl).toString());
    },
    "application/json":()=>{
      res.status(200).send(payload);
    }
  })
}


export async function sendLoginLink(req :Request, res :Response){
  let {username} = req.params;
  let userManager = getUserManager(req);

  let user = await userManager.getUserByName(username);
  if(!user.email){
    throw new BadRequestError(`Requested user has no registered email`);
  }
  let key = (await userManager.getKeys())[0];
  let payload = makeLoginLink(user, key);
  let link = makeRedirect(
    payload, 
    getHost(req)
  );

  let lang = "fr";
  const mail_content = await getLocals(req).templates.render(`emails/connection_${lang}`, {
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

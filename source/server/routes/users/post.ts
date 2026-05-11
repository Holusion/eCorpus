
import { Request, Response } from "express";

import { getHost, getLocals, getTaskScheduler, getUserManager } from "../../utils/locals.js";
import User, { isUserRole } from "../../auth/User.js";
import UserManager from "../../auth/UserManager.js";
import { BadRequestError } from "../../utils/errors.js";
import { makeRedirect } from "../auth/login.js";
import { sendEmail } from "../../tasks/handlers/sendEmail.js";
import { AcceptedLocales, dicts } from "../../utils/templates/index.js";


function pickLang(value: any): AcceptedLocales {
  return (dicts as readonly string[]).includes(value) ? value : "en";
}

/**
 * Accept JSON booleans (`true`/`false`) and form values (`"on"`, `"true"`, `"1"`).
 * Anything else &mdash; including the literal strings `"false"`, `"0"` or `""` &mdash;
 * is treated as opt-out.
 */
function isTruthyFlag(value: any): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return /^(on|true|1|yes)$/i.test(value);
  return false;
}


export default async function postUser(req :Request, res :Response){
  let userManager :UserManager = getUserManager(req);
  let {username, password, email, level = "create", lang, send_onboarding} = req.body;
  if(!username) throw new BadRequestError("username not provided");
  if(!password) throw new BadRequestError("password not provided");
  if(!isUserRole(level)) throw new BadRequestError("bad value for user level");
  if(!email) throw new BadRequestError("email not provided");
  let u = await userManager.addUser(username, password, level, email);

  if(isTruthyFlag(send_onboarding)){
    await dispatchOnboardingEmail(req, u, pickLang(lang));
  }

  res.format({
    "application/json": ()=>{
      res.status(201).send(User.safe(u));
    },
    "text/html": ()=>{
      if(req.get("referrer")){
        let referrer = new URL(req.get("referrer")!);
        if(referrer.pathname === "/ui/admin/users"){
          return res.redirect(303, referrer.toString());
        }
      }

      return res.status(201).send(`Created user ${u.username} <${u.email}>: ${u.level}`);

    },
    default: ()=>{
      return res.status(201).send(`Created user ${u.username} <${u.email}>: ${u.level}`)
    }
  });
};


/**
 * Render the onboarding email and schedule it as a `sendEmail` task.
 *
 * The task row is `create()`d (and awaited) before this function returns so
 * callers can observe the task immediately. Delivery itself runs in the
 * background and any failure is logged to the task row, not bubbled up.
 */
async function dispatchOnboardingEmail(req: Request, user: User, lang: AcceptedLocales){
  if(!user.email) return;
  const {sessionMaxAge, templates, config} = getLocals(req);
  const userManager = getUserManager(req);
  const taskScheduler = getTaskScheduler(req);

  const key = (await userManager.getKeys())[0];
  const link = makeRedirect(key, {
    user,
    expiresIn: sessionMaxAge,
    redirect: getHost(req),
  });

  const brand = config.get("brand") || "eCorpus";
  const html = await templates.render(`emails/onboarding_${lang}`, {
    layout: null,
    lang,
    name: user.username,
    url: link.toString(),
    brand,
    hostname: config.get("hostname"),
  });

  const subject = lang === "fr" ? `Bienvenue sur ${brand}` : `Welcome to ${brand}`;

  // Commit the task row first so it is observable as soon as the user
  // creation request returns, then dispatch the run without awaiting.
  const task = await taskScheduler.create({
    type: sendEmail.name,
    status: "pending",
    user_id: user.uid,
    data: { to: user.email, subject, html },
  });
  taskScheduler.runTask({ task, handler: sendEmail })
    .catch(err => console.error(`Onboarding email to ${user.email} failed:`, err));
}

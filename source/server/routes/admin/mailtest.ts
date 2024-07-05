import { Request, Response } from "express";
import sendmail from "../../utils/mails/send.js";
import { getLocals, getUser } from "../../utils/locals.js";
import { BadRequestError } from "../../utils/errors.js";

/**
 * Send a test email
 * Exposes all possible logs from the emailer
 * This is a protected route and requires admin privileges
 */
export default async function handleMailtest(req :Request, res :Response){
  const {config} = getLocals(req);
  const {username :requester, email:to} = getUser(req);
  if(!to){
    throw new BadRequestError("No email address found for user "+ requester);
  }
  let out = await sendmail({
    to, 
    subject: config.brand+" test email", 
    html: [
    `\t<h1>${config.brand} test email</h1>`,
    `\t<p>This is a test email sent from the admin panel of ${config.hostname}</p>`,
  ].join("\n")});

  res.status(200).send(out);
}
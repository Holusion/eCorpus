import { Request, Response } from "express";
import sendmail from "../../utils/mails/send.js";
import { getLocals, getUser } from "../../utils/locals.js";
import { BadRequestError } from "../../utils/errors.js";
import { useTemplateProperties } from "../views/index.js";

/**
 * Send a test email
 * Exposes all possible logs from the emailer
 * This is a protected route and requires admin privileges
 */
export default async function handleMailtest(req :Request, res :Response){
  const {config} = getLocals(req);
  let {to} = req.body ?? {};
  const user = getUser(req);
  if( user && !to){
    if(user.email){
      to = user.email
    }else{
      throw new BadRequestError("No email address found for user "+ user.username);
    }
  }

  useTemplateProperties(req, res);
  const mail_content = await getLocals(req).templates.render(`emails/test`, {
    layout: null,
    brand: config.brand,
    hostname: config.hostname,
  });

  //Special case to not send the email when testing
  if(to.endsWith("@example.com")){
    res.status(200).send({message: mail_content});
    return;
  }

  let out = await sendmail({
    to, 
    subject: config.brand+" test email", 
    html: mail_content
  });

  res.status(200).send(out);
}
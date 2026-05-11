import { Request, Response } from "express";
import { getLocals, getTaskScheduler, getUser, useTemplateProperties  } from "../../../utils/locals.js";
import { BadRequestError } from "../../../utils/errors.js";
import { sendEmail } from "../../../tasks/handlers/sendEmail.js";

/**
 * Send a test email
 * Dispatched as a task so failures and SMTP logs are observable via the tasks UI.
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
    brand: config.get("brand"),
    hostname: config.get("hostname"),
  });

  //Special case to not send the email when testing
  if(to.endsWith("@example.com")){
    res.status(200).send({message: mail_content});
    return;
  }

  const taskScheduler = getTaskScheduler(req);
  const out = await taskScheduler.run({
    handler: sendEmail,
    user_id: user?.uid ?? null,
    data: {
      to,
      subject: (config.get("brand") || "eCorpus")+" test email",
      html: mail_content,
    },
  });

  res.status(200).send(out);
}
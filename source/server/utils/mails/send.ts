
import nodemailer from "nodemailer";

import {Config} from "../config.js";


interface MailInput{
  to: string;
  subject: string;
  html :string;
  text?: string;
}



/**
 * Use smart host string with defaults
 */
let _transporter: nodemailer.Transporter|undefined;

/**
 * Override the cached SMTP transporter. Pass `undefined` to fall back to the
 * smart_host configuration the next time `send()` is called. Intended for tests.
 */
export function setTransporter(t: nodemailer.Transporter|undefined){
  _transporter = t;
}


/**
 * Low-level SMTP send. Almost all callers should go through the
 * `sendEmail` task handler instead so failures show up in the tasks UI
 * and a log line is persisted per delivery attempt.
 * @param transporter should only be changed in tests
 * @see {Templates} to write emails
 */
export default async function send(
  message :MailInput,
  transporter?: nodemailer.Transporter,
) :ReturnType<nodemailer.Transporter["sendMail"]>{
  if(!transporter && !_transporter){
    let transportURL = new URL(Config.get("smart_host"));
    //Set logger to the value of VERBOSE env var
    if(!transportURL.searchParams.has("logger")) transportURL.searchParams.set("logger", Config.get("verbose")? "true": "false");
    if(!transportURL.searchParams.has("name")) transportURL.searchParams.set("name", Config.get("hostname"));
    _transporter = nodemailer.createTransport(transportURL.toString())
  }

  transporter ??= _transporter;
  if(!transporter) throw new Error("Mail transporter is not initialized");

  const info = await transporter.sendMail({
    from: Config.get("contact_email"),
    ...message,
  });

  if(Config.get("verbose")){
    console.log("SMTP info :", info);
  }
  return info;
}

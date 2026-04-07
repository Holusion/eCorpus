
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
let _transporter: nodemailer.Transporter;


/**
 * use sendmail to send an email
 * **sendmail** is not really required but using /usr/bin/sendmail is not cross-platform and requires more configuration
 * @param sender should only be changed in tests
 * @see {Templates} to write emails
 * 
 * @deprecated should be in a task
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

  const info = await transporter.sendMail({
    from: Config.get("contact_email"),
    ...message,
  });

  if(Config.get("verbose")){
    console.log("SMTP info :", info);
  }
  return info;
}

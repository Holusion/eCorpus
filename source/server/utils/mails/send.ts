
import nodemailer from "nodemailer";

import config from "../config.js";


interface MailInput{
  to: string;
  subject: string;
  html :string;
  text?: string;
}



let transportURL = new URL(config.smart_host);
//Set logger to the value of VERBOSE env var
if(!transportURL.searchParams.has("logger")) transportURL.searchParams.set("logger", config.verbose? "true": "false");
if(!transportURL.searchParams.has("name")) transportURL.searchParams.set("name", config.hostname);

/**
 * Use smart host string with defaults
 */
const _transporter = nodemailer.createTransport(transportURL.toString());


/**
 * use sendmail to send an email
 * **sendmail** is not really required but using /usr/bin/sendmail is not cross-platform and requires more configuration
 * @param sender should only be changed in tests
 * @see {Templates} to write emails
 */
export default async function send(
  message :MailInput,
  transporter: ReturnType<typeof nodemailer.createTransport> =_transporter,
) :ReturnType<typeof transporter.sendMail>{

  const info = await transporter.sendMail({
    from: config.contact_email,
    ...message,
  });

  if(config.verbose){
    console.log("SMTP info :", info);
  }
  return info;
}

import sendmail from "sendmail";
import { once } from "events";
import config from "../config.js";

import { MailBody } from "./templates.js";
import { promisify } from "util";

const [smtpHost, smtpPortString] = config.smart_host.split(':');
let smtpPort = parseInt(smtpPortString, 10);
if(Number.isNaN(smtpPort)) smtpPort = 25;

const _send = promisify(sendmail({
  silent: true,
  smtpHost,
  smtpPort,
}));

export default async function send(to:string, content:MailBody){
  await _send({
    from: `noreply@${config.hostname}`,
    to,
    ...content
  });
}

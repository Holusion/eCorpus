import sendmail from "sendmail";
import { once } from "events";
import config from "../config.js";

import { BOUNDARY, MailBody } from "./templates.js";
import { promisify } from "util";

const _send = promisify(sendmail({
  silent: true,
  smtpHost:config.smart_host,
}));

export default async function send(to:string, content:MailBody){
  await _send({
    from: `noreply@${config.hostname}`,
    to,
    ...content
  });
}

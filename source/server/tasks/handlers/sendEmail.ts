import sendmail from "../../utils/mails/send.js";
import { TaskHandlerParams } from "../types.js";


export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  messageId?: string;
  /**
   * Effective recipient list as seen by the transport. For SMTP transports
   * this is `info.accepted`; for in-memory transports (e.g. nodemailer's
   * jsonTransport used in tests) we fall back to the envelope.
   */
  accepted: string[];
  rejected: string[];
  response?: string;
}

/**
 * Send an email through the configured SMTP transport.
 *
 * Wrapping {@link sendmail} in a task gives us a persisted log line per
 * delivery attempt and lets callers observe failures through the standard
 * tasks UI/API instead of having to scrape the server logs.
 */
export async function sendEmail({ task: { data }, context: { logger } }: TaskHandlerParams<SendEmailParams>): Promise<SendEmailResult> {
  const { to, subject } = data;
  logger.log(`Sending email to ${to} (subject: ${subject})`);
  const info = await sendmail({
    to: data.to,
    subject: data.subject,
    html: data.html,
    text: data.text,
  });
  // Not every nodemailer transport populates `accepted` (jsonTransport for
  // instance only reports `envelope`). Normalize so callers always have a list.
  const envelopeTo = ((info as any).envelope?.to ?? []) as string[];
  const accepted = ((info.accepted ?? envelopeTo) as Array<string|{address:string}>)
    .map(a => typeof a === "string" ? a : a.address);
  const rejected = ((info.rejected ?? []) as Array<string|{address:string}>)
    .map(a => typeof a === "string" ? a : a.address);

  logger.log(`Delivered to ${accepted.join(", ") || "<none>"}${rejected.length ? `, rejected: ${rejected.join(", ")}` : ""}`);
  if (info.messageId) logger.debug(`messageId: ${info.messageId}`);
  return {
    messageId: info.messageId,
    accepted,
    rejected,
    response: (info as any).response,
  };
}

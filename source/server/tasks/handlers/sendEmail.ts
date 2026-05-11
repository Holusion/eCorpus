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
  accepted?: string[];
  rejected?: string[];
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
  logger.log(`Delivered to ${(info.accepted ?? []).join(", ") || "<none>"}${info.rejected?.length ? `, rejected: ${info.rejected.join(", ")}` : ""}`);
  if (info.messageId) logger.debug(`messageId: ${info.messageId}`);
  return {
    messageId: info.messageId,
    accepted: info.accepted as string[] | undefined,
    rejected: info.rejected as string[] | undefined,
    response: (info as any).response,
  };
}

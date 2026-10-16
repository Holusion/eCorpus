import type { Request } from "express";
import { apiMessage, formatMessage, type ApiMessage } from "./index.js";

export type MessageRepresentation = "html" | "json" | "text";
const languages = ["en", "fr", "cimode"];

function supportedLanguage(value: string): string {
  const primary = value.toLowerCase().split(/[-_]/)[0];
  return languages.includes(primary) ? primary : "en";
}

/** API localization is opt-in per request; HTML additionally honors UI settings. */
export function messageLanguage(req: Request, representation: MessageRepresentation): string {
  if (typeof req.query.lang === "string") return supportedLanguage(req.query.lang);
  if (representation === "html" && typeof req.session?.lang === "string") {
    return supportedLanguage(req.session.lang);
  }
  return req.get("Accept-Language") ? req.acceptsLanguages(languages) || "en" : "en";
}

/** For custom warning/notice response objects as well as standard HTTP errors. */
export function localizeMessage(req: Request, message: ApiMessage, representation: MessageRepresentation = "json") {
  return { ...message, message: formatMessage(message, messageLanguage(req, representation)) };
}

export function localizeError(req: Request, error: Error & Partial<ApiMessage> & { code?: number }, representation: MessageRepresentation) {
  if (!error.messageCode) return error.message;
  const message = apiMessage(error.messageCode, error.messageParams);
  return `[${error.code}] ${localizeMessage(req, message, representation).message}`;
}

export function errorPayload(req: Request, error: Error & Partial<ApiMessage>, code: number) {
  return {
    code,
    message: `${error.name}: ${localizeError(req, { ...error, message: error.message, code }, "json")}`,
    ...(error.messageCode ? { messageCode: error.messageCode, messageParams: error.messageParams } : {}),
  };
}

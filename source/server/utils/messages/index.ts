import i18next from "i18next";
import { english, french } from "./catalogue.js";

export interface ApiMessage {
  messageCode: string;
  messageParams: Record<string, string | number>;
}

const translator = i18next.createInstance();
// Inline resources and synchronous initialization also cover errors raised before
// the service (and its asynchronous template engine) has finished starting.
void translator.init({
  resources: { en: { translation: english }, fr: { translation: french } },
  lng: "en",
  fallbackLng: "en",
  keySeparator: false,
  initImmediate: false,
  returnEmptyString: false,
  interpolation: { escapeValue: false },
});

function requireEnglish(code: string): void {
  if (!Object.hasOwn(english, code) || !english[code]?.trim()) {
    throw new Error(`Missing English API message: ${code}`);
  }
}

export function apiMessage(messageCode: string, messageParams: ApiMessage["messageParams"] = {}): ApiMessage {
  requireEnglish(messageCode);
  return { messageCode, messageParams };
}

/** Always validate English first, even if the requested language has an entry. */
export function formatMessage(message: ApiMessage, language = "en"): string {
  requireEnglish(message.messageCode);
  return translator.t(message.messageCode, { ...message.messageParams, lng: language });
}

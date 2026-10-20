import path from "node:path";
import i18next from "i18next";
import Backend from "i18next-fs-backend";

/**
 * Translations shared by code that has no access to a {@link Templates} instance (eg. errors).
 *
 * Initialized synchronously on import so that a {@link Localized} message can always be rendered,
 * including in unit tests that never create an app.
 * @fixme mirrors the `templates_dir` config default instead of reading the config
 */
export const i18n = i18next.createInstance({
  backend: {
    loadPath: path.join(process.env.TEMPLATES_DIR ?? path.join(process.cwd(), "templates"), "locales/{{lng}}.yml"),
  },
  initAsync: false,
  preload: ["en", "fr"],
  load: "languageOnly",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
}).use(Backend);
i18n.init();

/** Serializable form of a {@link Localized} message */
export interface LocalizedData {
  key: string;
  params?: Record<string, unknown>;
}

/**
 * A message that will be translated once we know who's reading it.
 * Renders as english whenever it's used as a string, so a missed translation degrades to english text.
 */
export class Localized {
  constructor(readonly key: string, readonly params: Record<string, unknown> = {}) {}

  translate(lng: string = "en"): string {
    return i18n.t(this.key, { ...this.params, lng });
  }

  toString() {
    return this.translate("en");
  }

  toJSON() {
    return this.toString();
  }

  /**
   * Plain data to store this message for later translation, eg. in task outputs.
   * Not used by `JSON.stringify`, which renders the english text.
   */
  toData(): LocalizedData {
    return { key: this.key, params: this.params };
  }
}

/**
 * Mark a message for translation. The key should exist in every `templates/locales/*.yml` file.
 * @example throw new BadRequestError(localize("errors.upload.notGlb", { filename }));
 */
export function localize(key: string, params?: Record<string, unknown>): Localized {
  return new Localized(key, params);
}

function isLocalizedData(value: unknown): value is LocalizedData {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const { key, params } = value as Record<string, unknown>;
  return typeof key === "string"
    && (params === undefined || (!!params && typeof params === "object" && !Array.isArray(params)));
}

/**
 * Message of a (possibly serialized) error, translated if it was {@link localize}d.
 */
export function translateErrorMessage(error: { code?: unknown, message: string, i18n?: LocalizedData }, lng: string): string {
  if (!isLocalizedData(error.i18n)) return error.message;
  const message = new Localized(error.i18n.key, error.i18n.params).translate(lng);
  return typeof error.code === "number" ? `[${error.code}] ${message}` : message;
}

/**
 * Top-level task output keys holding lists of messages for users.
 * Their {@link LocalizedData} entries get translated when the task is sent to a client.
 * Nothing else in a task output is ever translated.
 */
export const localizedOutputKeys = ["warnings", "messages"] as const;

export type LocalizedOutput = { [K in typeof localizedOutputKeys[number]]?: LocalizedData[] };

/** A {@link LocalizedData} entry once translated for a client */
export interface TranslatedData extends LocalizedData {
  message: string;
}

/**
 * Translates a task's output for a client.
 * Failed tasks get their error message translated,
 * successful ones get a `message` added to the entries of their {@link localizedOutputKeys} lists.
 * Returns `output` itself when there is nothing to translate.
 */
export function translateTaskOutput(status: string, output: unknown, lng: string): unknown {
  if (!output || typeof output !== "object" || Array.isArray(output)) return output;
  const record = output as Record<string, unknown>;
  if (status === "error") {
    if (!isLocalizedData(record.i18n) || typeof record.message !== "string") return output;
    return { ...record, message: translateErrorMessage(record as any, lng) };
  }
  let translated: Record<string, unknown> | undefined;
  for (const key of localizedOutputKeys) {
    const list = record[key];
    if (!Array.isArray(list)) continue;
    translated ??= { ...record };
    translated[key] = list.map(entry => isLocalizedData(entry)
      ? { ...entry, message: new Localized(entry.key, entry.params).translate(lng) } satisfies TranslatedData
      : entry);
  }
  return translated ?? output;
}

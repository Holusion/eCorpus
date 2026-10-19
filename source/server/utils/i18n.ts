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
}

/**
 * Mark a message for translation. The key should exist in every `templates/locales/*.yml` file.
 * @example throw new BadRequestError(localize("errors.upload.notGlb", { filename }));
 */
export function localize(key: string, params?: Record<string, unknown>): Localized {
  return new Localized(key, params);
}

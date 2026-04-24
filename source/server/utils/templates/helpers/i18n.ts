import { TFunction } from "i18next";

interface HandleBarsContextData {
  t: TFunction;
  _parent?: HandleBarsContextData;
  root: Record<string, any>;
}

interface HandlebarsHelperContext {
  lookupProperty: (p: any[]) => any;
  hash: any;
  data: HandleBarsContextData;
}

/**
 * Handlebars helper: `i18n`
 *
 * Translates a key using the i18next `t` function injected into template data by
 * `Templates.render()`. The language is taken from `context.lang` (set per-request).
 *
 * Template syntax:
 *   {{i18n "key"}}
 *   {{i18n "key" "default text"}}
 *   {{i18n "key" param=value}}
 *   {{i18n "key" "default text" param=value}}
 *
 * If `lang` is missing from the root context it defaults to `"en"` with a console warning.
 * Pass `lang="cimode"` to get the raw key back (useful for debugging).
 *
 * @param key    i18next translation key
 * @param props  Optional default value string, optional hash named params, Handlebars options (last)
 */
export function i18nHelper(this: any, key: string, ...props: any[]): string {
  const { hash, data }: HandlebarsHelperContext = props.pop();
  const default_value: string | undefined = props.pop();
  if (typeof data.t !== "function") {
    console.warn("No translation function in context", key);
    return key;
  }
  const opts = {
    lng: data.root.lang,
    ...hash,
  };
  if (!opts.lng) {
    console.warn('Language not set. Defaulting to "en"');
    opts.lng = "en";
  }
  return (default_value ? data.t(key, default_value, opts) : data.t(key, opts)) as string;
}

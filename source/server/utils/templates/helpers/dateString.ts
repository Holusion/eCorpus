/**
 * Handlebars helper: `dateString`
 *
 * Formats a `Date` (or date-parseable string) for display. Strings are coerced to
 * `Date` automatically.
 *
 * Template syntax:
 *   {{dateString date}}              → locale string using `context.lang` (e.g. "4/23/2026, 10:00:00 AM")
 *   {{dateString date "iso"}}        → ISO 8601 (e.g. "2026-04-23T10:00:00.000Z")
 *   {{dateString date "date"}}       → date-only locale string (e.g. "4/23/2026")
 *   {{dateString date "fr-FR"}}      → locale string for a specific BCP 47 locale
 *   {{dateString date "en-US"}}      → locale string for en-US
 *
 * The format argument is case-insensitive for `"iso"` and `"date"`. Any other value
 * is passed directly to `Date.toLocaleString()` as a locale tag.
 * When no format is given, `this.lang` from the template context is used as the locale.
 *
 * @param when    `Date` object or date string to format
 * @param args    Optional format string (`"iso"` or BCP 47 locale tag), Handlebars options (last)
 */
export function dateString(this: any, when: Date | string, ...args: any[]): string {
  const context = args.pop();
  if (!context) {
    console.warn("No argument provided to dateString helper");
    return "Invalid Date";
  }
  const format: string | undefined = args.pop();
  if (!(when instanceof Date)) when = new Date(when);
  const lang = context.data?.root?.lang ?? this.lang;
  if (format && format.toLowerCase() === "iso") {
    return when.toISOString();
  } else if (format && format.toLowerCase() === "date") {
    return when.toLocaleDateString(lang);
  } else if (format) {
    return when.toLocaleString(format);
  } else {
    return when.toLocaleString(lang);
  }
}

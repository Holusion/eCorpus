/**
 * Handlebars helpers registered with every `Templates` instance.
 *
 * QUICK REFERENCE — template syntax cheat-sheet for .hbs templates:
 *
 *  navLink  — block helper, renders <a class="nav-link [active]" href="...">
 *    {{#navLink "/path"}}Label{{/navLink}}
 *    {{#navLink "/path" "exact"}}Label{{/navLink}}      prefix match → exact match
 *    {{#navLink "/path" "disabled"}}Label{{/navLink}}   extra string args become HTML attributes
 *    Requires `location` in template context (the current request pathname).
 *
 *  i18n  — translate a key via i18next
 *    {{i18n "key"}}
 *    {{i18n "key" "default text"}}
 *    {{i18n "key" param=value}}
 *    Requires `lang` in template context (e.g. "en", "fr", "cimode").
 *
 *  join  — concatenate / path-build strings and arrays
 *    {{join a b c}}                  → "abc"
 *    {{join a b separator=", "}}     → "a, b"
 *    {{join "/api/" id "/data"}}     → "/api/42/data"
 *    Arrays are flattened before joining. Best combined with navLink for dynamic hrefs.
 *
 *  test  — binary comparison, designed as a subexpression
 *    {{#if (test x "==" "foo")}}...{{/if}}
 *    {{#if (test role "in" allowedRoles)}}...{{/if}}
 *    operators: == === != < > <= >= => =< && || in
 *
 *  dateString  — format a Date for display
 *    {{dateString date}}             → locale string (uses context.lang)
 *    {{dateString date "iso"}}       → ISO 8601
 *    {{dateString date "fr-FR"}}     → French locale string
 *
 *  encodeURIComponent  — encode a single URI segment or query value
 *    {{encodeURIComponent value}}
 *
 *  encodeURI  — encode a full URI (preserves : / ? # etc.)
 *    {{encodeURI url}}
 */

import { navLink } from "./navLink.js";
import { i18nHelper } from "./i18n.js";
import { join } from "./join.js";
import { test } from "./test.js";
import { dateString } from "./dateString.js";
import { encodeURIComponentHelper, encodeURIHelper } from "./encoding.js";

export { navLink } from "./navLink.js";
export { i18nHelper } from "./i18n.js";
export { join } from "./join.js";
export { test } from "./test.js";
export { type TestOperator } from "./test.js";
export { dateString } from "./dateString.js";
export { encodeURIComponentHelper, encodeURIHelper } from "./encoding.js";

/** Collected helpers object — pass directly to `hbs.registerHelper(staticHelpers)` */
export const staticHelpers = {
  navLink,
  i18n: i18nHelper,
  join,
  test,
  dateString,
  encodeURIComponent: encodeURIComponentHelper,
  encodeURI: encodeURIHelper,
};

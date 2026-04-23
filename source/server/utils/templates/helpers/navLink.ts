/**
 * Handlebars block helper: `navLink`
 *
 * Renders an `<a>` element with `class="nav-link"`. Adds `"active"` to the class
 * when the current page location matches the link's href.
 *
 * Template syntax:
 *   {{#navLink "/path"}}Label{{/navLink}}
 *   {{#navLink "/path" "exact"}}Label{{/navLink}}
 *   {{#navLink "/path" "disabled" 'id="foo"'}}Label{{/navLink}}
 *   {{#navLink (join "/items/" id)}}Label{{/navLink}}
 *
 * Matching rules:
 *   - By default, `active` is added when `this.location` **starts with** href.
 *   - Pass the literal string `"exact"` to require a strict equality match instead.
 *
 * Extra string arguments (other than `"exact"`) are appended verbatim as HTML attributes.
 * `this.location` must be set in the template context (typically the request pathname).
 *
 * @param args  href string, optional flags/attributes, Handlebars options object (last)
 */
export function navLink(this: any, ...args: any[]): string {
  if (args.length < 2) return `Invalid block parameters: require at least 1 argument, received ${args.length}`;
  const options = args.pop();
  let href = "";
  let exact = false;
  const rest: string[] = [];
  for (const arg of args) {
    if (arg === "exact") {
      exact = true;
    } else if (!href) {
      href = arg;
    } else if (typeof arg !== "undefined") {
      rest.push(arg);
    }
  }
  const match = exact ? href === this.location : this.location?.startsWith(href);
  return `<a class="nav-link${match ? " active" : ""}" href="${href}"${rest.length ? " " : ""}${rest.join(" ")}>${options.fn(this)}</a>`;
}

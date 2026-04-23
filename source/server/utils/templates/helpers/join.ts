/**
 * Handlebars helper: `join`
 *
 * Concatenates all positional arguments into a single string.
 * Arrays are flattened one level before joining. Null → `"null"`, undefined → `"undefined"`,
 * objects → their `.toString()`.
 *
 * Template syntax:
 *   {{join a b c}}                     → "abc"
 *   {{join "/api/" id "/data"}}        → "/api/42/data"
 *   {{join a b separator=", "}}        → "a, b"
 *   {{join arr separator="-"}}         → "item1-item2-item3"  (arr is an array)
 *
 * Tip: combine with `navLink` for dynamic hrefs:
 *   {{#navLink (join "/scenes/" id)}}Scene{{/navLink}}
 *
 * @param args                   Positional values (any type) + Handlebars options object (last)
 * @param args[last].hash.separator  String inserted between values (default `""`)
 */
export function join(this: any, ...args: any[]): string {
  const { hash } = args.pop();
  function m(p: any): string | string[] {
    if (typeof p === "undefined") return "undefined";
    else if (p === null) return "null";
    else if (Array.isArray(p)) return p.map(m) as string[];
    else return p.toString();
  }
  return args.map(m).flat().join(hash.separator ?? "");
}

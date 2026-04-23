/**
 * Handlebars helper: `encodeURIComponent`
 *
 * Encodes a URI component, escaping all characters except: `A–Z a–z 0–9 - _ . ! ~ * ' ( )`
 * Use this when embedding a single dynamic value inside a URL query string or path segment.
 *
 * Template syntax:
 *   {{encodeURIComponent value}}
 *   <a href="/search?q={{encodeURIComponent query}}">Search</a>
 *
 * @param component  Value to encode
 */
export function encodeURIComponentHelper(this: any, component: string): string {
  return encodeURIComponent(component);
}

/**
 * Handlebars helper: `encodeURI`
 *
 * Encodes a complete URI, preserving characters with special meaning in URIs
 * (`: / ? # [ ] @ ! $ & ' ( ) * + , ; =`).
 * Use this when you have a full URL that may contain spaces or non-ASCII characters.
 *
 * Template syntax:
 *   {{encodeURI url}}
 *   <a href="{{encodeURI fullUrl}}">Link</a>
 *
 * @param uri  URI to encode
 */
export function encodeURIHelper(this: any, uri: string): string {
  return encodeURI(uri);
}

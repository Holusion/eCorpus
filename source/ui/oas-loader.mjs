import showdown from "showdown";
import {parse} from 'yaml';

/**
 * Simple one-shot yaml loader for webpack to use already-bundled yaml module
 */
export default function (source) {
  const converter = new showdown.Converter();
  // Apply some transformations to the source...
  const obj = parse(source, (key, value)=>{
    if(key === "description") return converter.makeHtml(value);
    else return value;
  });
  return `export default ${JSON.stringify(obj)}`;
}
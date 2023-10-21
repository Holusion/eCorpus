import Handlebars from "handlebars";
import { promises as fs } from "fs";
import path from "path";
import { HTTPError, InternalError, NotFoundError } from "./errors.js";

interface TemplateConstructorOptions{
  dir: string;
  cache?: boolean;
}

interface EmailOptions{
  layout?: "email"|string;
  lang?: "fr"|"en";
  [key:string]:any;
}

export default class Templates{
  #cacheMap ?:Map<string, Handlebars.TemplateDelegate>;
  #dir :string;
  get #layoutsDir() :string{ return path.join(this.#dir, "layouts"); }

  constructor(opts :TemplateConstructorOptions){
    this.#dir = opts?.dir;
    if(opts.cache){
      this.#cacheMap = new Map();
    }
  }

  get dir(){
    return this.#dir;
  }

  async compile(filepath :string):Promise<ReturnType<typeof Handlebars.compile>>{
    if( !/\.hbs$/i.test(filepath)) filepath = filepath + ".hbs";
    const d = await fs.readFile(filepath, {encoding: "utf-8"});
    return Handlebars.compile(d);
  }

  /**
   * Wrapper around `Template.compile` that caches the result when `cache` is set to `true` in the constructor.

   */
  async getset(filepath :string) :Promise<Awaited<ReturnType<typeof this.compile>>>{
    return this.#cacheMap?.get(filepath) ?? await (async ()=>{
      let tmpl = await this.compile(filepath);
      this.#cacheMap?.set(filepath, tmpl);
      return tmpl;
    })();
  }
  /**
   * render a template file
   * Will not check if filepath _should_ be accessible.
   * this is the caller's responsibility to only call for valid templates
   * @param filepath path to the file, absolute or relative to this.#dir
   * @param options template options
   * @see https://handlebarsjs.com
   */
  async render(filepath :string, options:any ={}) :Promise<string>{
    filepath = path.isAbsolute(filepath)? filepath : path.resolve(this.#dir, filepath);
    const html = (await this.getset(filepath))(options);
    const layoutName = typeof options.layout !== "undefined" ? options.layout : "main";
    if(!layoutName) return html;
    return await this.render(path.resolve(this.#layoutsDir, layoutName+".hbs"),{...options, body: html, layout: null});
  }
  /**
   * wrapper around render to be used as express middleware.
   */
  middleware = (filepath :string, options :any, callback :(e: any, rendered?: string | undefined) => void)=>{
    this.render(filepath, options).then(r=>callback(null, r), (err)=>{
      return callback(new InternalError(err.message));
    });
  }
}
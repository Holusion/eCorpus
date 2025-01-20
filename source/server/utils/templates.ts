import Handlebars from "handlebars";
import { promises as fs } from "fs";
import path, { basename } from "path";
import { HTTPError, InternalError, NotFoundError } from "./errors.js";
import i18next, { i18n, TFunction } from "i18next";
import Backend from "i18next-fs-backend";

interface TemplateConstructorOptions{
  dir: string;
  cache?: boolean;
}

interface RenderOptions{
  layout?:string|null;
  [key:string]:any;
}

interface EmailOptions extends RenderOptions{
  layout?: "email"|string;
  lang?: "fr"|"en";
}

interface HandleBarsContextData{
  t :TFunction;
  _parent ?:HandleBarsContextData;
  root: Record<string,any>
}

interface HandlebarsHelperContext{
  lookupProperty: (p:any[]) => any;
  hash: any;
  data:HandleBarsContextData;
}

const staticHelpers = {
  navLink(this:any, ...args :any[]){
    if(args.length < 2) return `Invalid block parameters: require at least 1 argument, received ${args.length}`;
    const options = args.pop();
    let href = "";
    let exact = false;
    let rest = [];
    for(let arg of args){
      if(arg === "exact"){
        exact = true;
        continue;
      }else if(!href){
        href = arg;
        continue;
      }else if(typeof arg === "undefined"){
        continue;
      }
      rest.push(arg);
    }
    const match = exact? href === this.location : this.location?.startsWith(href);
    return `<a class="nav-link${match?" active":""}" href="${href}"${rest.length?" ":""}${rest.join(" ")}>${options.fn(this)}</a>`;
  },
  i18n(this:any, key: string, ...args:any[]){
    const context:HandlebarsHelperContext = args.pop();
    if(typeof context.data.t != "function"){
      console.warn("No translation function in context", context);
      return key;
    }else if(typeof context.data.root.lang != "string"){
      console.warn("Language not set. Defaulting to \"en\"");
      return context.data.t(key, {
        lng: "en",
      });
    }else{
      return context.data.t(key, {
        lng: context.data.root.lang,
      });
    }
  },
  encodeURIComponent(this:any, component:string){
    return encodeURIComponent(component);
  },
  encodeURI(this:any, uri:string){
    return encodeURI(uri);
  },
  join(this:any, ...args:any[]){
    function m(p:any):string|string[]{
      if(typeof p === "undefined") return "undefined";
      else if(p === null) return "null";
      else if(Array.isArray(p)) return p.map(m) as string[];
      else return p.toString();
    }
    return args.slice(0, -1).map(m).flat().join("");
  },
  dateString(this:any, when:Date|string, ...args:any[]){
    const context = args.pop();
    if(!context){
      console.warn("No argument provided to dateString helper");
      return "Invalid Date";
    }
    const format = args.pop();
    if(!(when instanceof Date)) when = new Date(when);
    if(format && format.toLowerCase() === "iso"){
      return when.toISOString();
    }else if (format){
      return when.toLocaleString(format);
    }else{
      return when.toLocaleString(this.lang);
    }
  }
}

export default class Templates{
  #cacheMap ?:Map<string, Handlebars.TemplateDelegate>;
  #partials ?:Array<string>;
  #dir :string;
  #hbs = Handlebars.create();
  #i18n :i18n;

  readonly #layoutsDir :string;
  readonly #partialsDir :string;


  constructor(opts :TemplateConstructorOptions){
    this.#dir = opts?.dir;
    this.#layoutsDir = path.join(this.#dir, "layouts");
    this.#partialsDir = path.join(this.#dir, "partials");

    this.#i18n = i18next.createInstance({
      debug: false,
      backend:{
        loadPath: path.join(this.#dir, "locales/{{lng}}.yml"),
      },
      load: 'languageOnly',
      fallbackLng: 'en',
      saveMissing: true,
      saveMissingTo: "current",
      missingKeyHandler(lngs, ns, key, fallbackValue, updateMissing, options) {
        console.log(`i18n Missing key in ${lngs.join(", ")}: ${key} (default to ${fallbackValue})`);
      },
    }).use(Backend);

    this.#hbs.registerHelper(staticHelpers);
    if(opts.cache){
      this.#cacheMap = new Map();
    }
  }

  get dir(){
    return this.#dir;
  }


  async listPartials(dir = this.#partialsDir) :Promise<string[]>{
    if(this.#partials) return this.#partials;
    let files = await fs.readdir(dir, {withFileTypes:true}).catch(e=>{if(e.code === "ENOENT")return []; else throw e});
    let partials = [];
    for (let f of files){
      let filepath = path.join(dir, f.name)
      if(f.isDirectory()) partials.push(...await this.listPartials(filepath));
      else if(f.isFile()) partials.push(filepath);
    }
    if(this.#cacheMap){
      //Using cache
      this.#partials = partials;
    }
    return partials;
  }

  async getPartials():Promise<Record<string, HandlebarsTemplateDelegate>> {
    return Object.fromEntries(await Promise.all((await this.listPartials()).map(async(filepath)=>{
      const name = path.relative(this.#partialsDir, filepath).slice(0, -4);
      return [name, await this.getset(filepath)]
    })));
  }
  
  async compile(filepath :string, options?:CompileOptions):Promise<ReturnType<typeof Handlebars.compile>>{
    if( !/\.hbs$/i.test(filepath)) filepath = filepath + ".hbs";
    const d = await fs.readFile(filepath, {encoding: "utf-8"});
    return this.#hbs.compile(d, options);
  }

  /**
   * Wrapper around `Template.compile` that caches the result when `cache` is set to `true` in the constructor.

   */
  async getset(filepath :string, opts ?:CompileOptions) :Promise<HandlebarsTemplateDelegate>{
    return this.#cacheMap?.get(filepath) ?? await (async ()=>{
      let tmpl = await this.compile(filepath, opts);
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
  async render(filepath :string, {layout, ...context}: RenderOptions={}) :Promise<string>{
    const t = this.#i18n.isInitialized? this.#i18n.t : await this.#i18n.init();
    await ((this.#cacheMap )?this.#i18n.loadResources: this.#i18n.reloadResources)(context.lang);
    filepath = path.isAbsolute(filepath)? filepath : path.resolve(this.#dir, filepath);
    const html = (await this.getset(filepath))({...context}, {
      partials: await this.getPartials(),
      data: {t},
    });
    const layoutName = typeof layout !== "undefined" ? layout : "main";
    if(!layoutName) return html;
    return await this.render(path.resolve(this.#layoutsDir, layoutName+".hbs"),{...context, body: html, layout: null});
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
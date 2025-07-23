import Handlebars from "handlebars";
import { promises as fs } from "fs";
import path, { basename } from "path";
import { HTTPError, InternalError, NotFoundError } from "./errors.js";
import i18next, { i18n, TFunction } from "i18next";
import Backend from "i18next-fs-backend";

export const dicts = ["fr", "en"] as const;
export const locales = [...dicts, "cimode"];
export type AcceptedLocales = typeof dicts[number]| "cimode";


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
  lang?: AcceptedLocales;
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

type TestOperator = "in"|"=="|"==="|"!="|"<"|">"|"<="|"=<"|">="|"=>"|"&&"|"||";

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
  i18n(this:any,  key: string, ...props:any[]){
    const {hash, data}:HandlebarsHelperContext = props.pop();
    const default_value :string|undefined = props.pop();
    if(typeof data.t != "function"){
      console.warn("No translation function in context", context);
      return key;
    }
    let opts = {
      lng: data.root.lang,
      ...hash,
    };
    if(!opts.lng){
      console.warn("Language not set. Defaulting to \"en\"");
      opts.lng = "en";
    }

    return default_value? data.t(key, default_value, opts): data.t(key, opts);
  },
  encodeURIComponent(this:any, component:string){
    return encodeURIComponent(component);
  },
  encodeURI(this:any, uri:string){
    return encodeURI(uri);
  },
  join(this:any, ...args:any[]){
    const {hash} = args.pop();
    function m(p:any):string|string[]{
      if(typeof p === "undefined") return "undefined";
      else if(p === null) return "null";
      else if(Array.isArray(p)) return p.map(m) as string[];
      else return p.toString();
    }
    return args.map(m).flat().join(hash.separator ?? "");
  },
  test(this:any, a:any, op:TestOperator, b:any, ...args:any[]){
    if(typeof b === "undefined" || !args.length){
      if(a =="!") return !op;
      console.warn("Invalid number of arguments for test helper:",a,op,b);
      return false;
    }
    if(op == "in") return (Array.isArray(b)?b:[b]).indexOf(a) !== -1;
    else if(op == "==") return a == b;
    else if(op == "===") return a === b;
    else if(op == "!=") return a != b;
    else if(op == "<") return a < b;
    else if(op == ">") return a > b;
    else if(op == "<=" || op == "=<") return a <= b;
    else if(op == "=>" || op == ">=") return a >= b;
    else if(op == "&&") return a && b;
    else if(op == "||") return a || b;
    else{
      console.warn("Unsupported test operator: \"%s\"", op);
      return false;
    }
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
  
  async initI18n() :Promise<TFunction>{
    if(this.#i18n.isInitialized) return this.#i18n.t;
    await this.#i18n.init();
    //Add formatters here if necessary
    return this.#i18n.t;
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
    const t = await this.initI18n();
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
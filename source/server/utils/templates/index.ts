import Handlebars from "handlebars";
import { promises as fs } from "fs";
import path from "path";
import { InternalError } from "../errors.js";
import i18next, { i18n, TFunction } from "i18next";
import Backend from "i18next-fs-backend";
import { staticHelpers } from "./helpers/index.js";

export const dicts = ["fr", "en"] as const;
export const locales = [...dicts, "cimode"];
export type AcceptedLocales = typeof dicts[number] | "cimode";


interface TemplateConstructorOptions {
  dir: string;
  cache?: boolean;
}

interface RenderOptions {
  layout?: string | null;
  [key: string]: any;
}

interface EmailOptions extends RenderOptions {
  layout?: "email" | string;
  lang?: AcceptedLocales;
}

export default class Templates {
  #cacheMap?: Map<string, Handlebars.TemplateDelegate>;
  #partials?: Array<string>;
  #dir: string;
  #hbs = Handlebars.create();
  #i18n: i18n;

  readonly #layoutsDir: string;
  readonly #partialsDir: string;


  constructor(opts: TemplateConstructorOptions) {
    this.#dir = opts.dir;
    this.#layoutsDir = path.join(this.#dir, "layouts");
    this.#partialsDir = path.join(this.#dir, "partials");

    this.#i18n = i18next.createInstance({
      debug: false,
      backend: {
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
    if (opts.cache) {
      this.#cacheMap = new Map();
    }
  }

  get dir() {
    return this.#dir;
  }

  /**
   * Get the translate function of the templates renderer
   * Useful to translate a string of text outside of templates eg: when reporting an error
   */
  get t() {
    return this.#i18n.t;
  }


  async listPartials(dir = this.#partialsDir): Promise<string[]> {
    if (this.#partials) return this.#partials;
    let files = await fs.readdir(dir, { withFileTypes: true }).catch(e => { if (e.code === "ENOENT") return []; else throw e });
    let partials = [];
    for (let f of files) {
      let filepath = path.join(dir, f.name)
      if (f.isDirectory()) partials.push(...await this.listPartials(filepath));
      else if (f.isFile()) partials.push(filepath);
    }
    if (this.#cacheMap) {
      this.#partials = partials;
    }
    return partials;
  }

  async getPartials(): Promise<Record<string, HandlebarsTemplateDelegate>> {
    return Object.fromEntries(await Promise.all((await this.listPartials()).map(async (filepath) => {
      const name = path.relative(this.#partialsDir, filepath).slice(0, -4);
      return [name, await this.getset(filepath)]
    })));
  }

  async initI18n(): Promise<TFunction> {
    if (this.#i18n.isInitialized) return this.#i18n.t;
    await this.#i18n.init();
    return this.#i18n.t;
  }

  async compile(filepath: string, options?: CompileOptions): Promise<ReturnType<typeof Handlebars.compile>> {
    if (!/\.hbs$/i.test(filepath)) filepath = filepath + ".hbs";
    const d = await fs.readFile(filepath, { encoding: "utf-8" });
    return this.#hbs.compile(d, options);
  }

  async getset(filepath: string, opts?: CompileOptions): Promise<HandlebarsTemplateDelegate> {
    return this.#cacheMap?.get(filepath) ?? await (async () => {
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
  async render(filepath: string, { layout, ...context }: RenderOptions = {}): Promise<string> {
    const t = await this.initI18n();
    await ((this.#cacheMap) ? this.#i18n.loadResources : this.#i18n.reloadResources)(context.lang);
    filepath = path.isAbsolute(filepath) ? filepath : path.resolve(this.#dir, filepath);
    const html = (await this.getset(filepath))({ ...context }, {
      partials: await this.getPartials(),
      data: { t },
    });
    const layoutName = typeof layout !== "undefined" ? layout : "main";
    if (!layoutName) return html;
    return await this.render(path.resolve(this.#layoutsDir, layoutName + ".hbs"), { ...context, body: html, layout: null });
  }

  /**
   * wrapper around render to be used as express middleware.
   */
  middleware = (filepath: string, options: any, callback: (e: any, rendered?: string | undefined) => void) => {
    this.render(filepath, options).then(r => callback(null, r), (err) => {
      return callback(new InternalError(err.message));
    });
  }
}

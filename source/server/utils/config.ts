import path from "path"
import {hostname} from "os";
import { Database } from "../vfs/helpers/db.js";

/**
 * Configuration values that are only available as environment variables
 */
const static_values = {
  node_env:        ["development", "string"],
  public:          [true,          "boolean"],
  port:            [8000,          "listenTarget"],
  force_migration: [false,         "boolean"],
  clean_database:  [true,          "boolean"],
  root_dir:        [process.cwd(), "path"],
  migrations_dir:  [path.join(process.cwd(),"migrations"), "path"],
  templates_dir:   [path.join(process.cwd(),"templates"),  "path"],
  scripts_dir:     [path.join(process.cwd(),"scripts"),    "path"],
  files_dir:       [({root_dir}:{root_dir:string})=> path.resolve(root_dir,"files"), "path"],
  dist_dir:        [({root_dir}:{root_dir:string})=> path.resolve(root_dir,"dist"),  "path"],
  assets_dir:      [undefined,    "path"],
  database_uri:    [parsePGEnv,   "string"],
  trust_proxy:     [true,         "boolean"],
  build_ref:       ["dev",        "string"],
} as const;

/**
 * Configuration values that can be overridden via the database in addition to environment variables.
 * Precedence: env var > database value > default value
 */
const runtime_values = {
  brand:                 ["",                "string"],
  hostname:              [hostname(),        "string"],
  color_primary:         ["#e6b900",       "color"],
  color_secondary:       ["#4735df",       "color"],
  contact_email:         [({hostname}:{hostname: string})=> "noreply@"+hostname, "string"],
  verbose:               [false,             "boolean"],
  smart_host:            ["smtp://localhost:25", "string"],
  experimental:          [false,             "boolean"],
  /// RETENTION (in days; 0 disables) ///
  task_retention_days:        [30,           "number"],
  task_errors_retention_days: [90,           "number"],
  /// FEATURE FLAGS ///
  enable_document_merge: [isExperimental,    "boolean"],
} as const;

const _all_values = {...static_values, ...runtime_values} as const;

/** Keys whose values can be stored and updated in the database */
type RKey = keyof typeof runtime_values;
type SKey = keyof typeof static_values;
type Key = keyof typeof _all_values;


// ---- Validator functions ----

function toString(s:string):string{
  return s;
}

function toPath(s:string):string{
  return path.normalize(s);
}

function toUInt(s:string):number{
  let n = parseInt(s, 10);
  if(Number.isNaN(n) || !Number.isSafeInteger(n) || n < 0) throw new Error("expected a valid positive integer");
  return n;
}

function toListenTarget(s:string):number|string{
  try{
    return toUInt(s);
  }catch(e){
    return s;
  }
}

function toBool(s:string):boolean{
  return !(!s || s.toLowerCase() === "false" || s == "0");
}

/** Branded type for color config values — serialized as a CSS color string */
export type ColorString = string & { readonly _brand: "color" };
function toColor(s: string): ColorString{
  return s as ColorString;
}


// ---- Option type maps (single source of truth) ----

const validatorMap = {
  string:       toString,
  color:        toColor,
  path:         toPath,
  boolean:      toBool,
  number:       toUInt,
  listenTarget: toListenTarget,
} as const;

const htmlTypeMap = {
  string:       "text",
  color:        "color",
  path:         "text",
  boolean:      "checkbox",
  number:       "number",
  listenTarget: "text",
} as const;

type OptionType = keyof typeof validatorMap;
type HTMLInputType = typeof htmlTypeMap[OptionType];
type OptionTypeToValueType = { [K in OptionType]: ReturnType<typeof validatorMap[K]> };


// ---- TypeScript intermediate types ----

type ValueType<T extends Key> = OptionTypeToValueType[Extract<typeof _all_values[T][1], OptionType>];

type BuildKey<T extends Key> = (c :Partial<Omit<{[U in SKey]: ValueType<U>}, T>>, env: NodeJS.ProcessEnv) => ValueType<T>;

/** Internal shape produced by parse() */
type ConfigShape = {
  [T in Key]: typeof _all_values[T][0] extends BuildKey<T>? ReturnType<typeof _all_values[T][0]> : ValueType<T>;
}

export type StaticConfigShape = {
  [T in keyof typeof static_values]: typeof static_values[T][0] extends BuildKey<T>? ReturnType<typeof static_values[T][0]> : ValueType<T>;
}

interface ConfigEntry<K extends Key=any>{
  value: ValueType<K>;
  locked: boolean;
  type: HTMLInputType;
  defaultValue: ValueType<K>;
}


// ---- Factory / computed defaults ----

/**
 * used to default a value to "false", unless EXPERIMENTAL flag is set
 */
function isExperimental({experimental}: {experimental: boolean}) :boolean{
  return experimental;
}


/**
 * Constructs a PostgreSQL connection URI from environment variables.
 *
 * Uses Unix domain socket for local development (when no PGHOST or PGPASSWORD),
 * or TCP connection (when either PGHOST or PGPASSWORD is set).
 *
 * @param _config - Unused parameter (kept for BuildKey compatibility)
 * @param env - NodeJS environment variables object to parse
 *
 * @returns A PostgreSQL connection URI string
 *
 * @example
 * // Socket mode (local development)
 * parsePGEnv({}, {})
 * // → "socket:///var/run/postgresql/"
 *
 * parsePGEnv({}, { PGDATABASE: "mydb" })
 * // → "socket:///var/run/postgresql/?db=mydb"
 *
 * @example
 * // TCP mode with host
 * parsePGEnv({}, { PGHOST: "db.example.com" })
 * // → "postgres://db.example.com:5432/{SYSTEM_USER}"
 *
 * @example
 * // TCP mode with full config
 * parsePGEnv({}, {
 *   PGHOST: "db.example.com",
 *   PGPORT: "5433",
 *   PGUSER: "appuser",
 *   PGPASSWORD: "secret",
 *   PGDATABASE: "myapp"
 * })
 * // → "postgres://appuser:secret@db.example.com:5433/myapp"
 *
 * @remarks
 *
 * **Socket Mode:** Activated when NEITHER PGHOST nor PGPASSWORD are present.
 * - Uses local Unix domain socket at `/var/run/postgresql/`
 * - Variables PGUSER, PGPORT are ignored
 * - PGDATABASE becomes a query parameter if specified
 * - Requires local PostgreSQL cluster with trust authentication
 *
 * **TCP Mode:** Activated when either PGHOST or PGPASSWORD is set.
 * - Defaults: localhost:5432 with user from process.env.USER
 * - Override with PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE env vars
 *
 * **Important Implementation Notes:**
 * - Uses `process.env.USER` directly (bypasses passed `env` parameter) for default user
 * - PGPORT is handled as string, not validated as numeric
 * - Special characters in passwords are URL-encoded automatically
 * - Empty string env values may cause unexpected behavior (not validated)
 * - PGPASSWORD alone (without PGHOST) will connect to localhost with password (TCP mode)
 */
function parsePGEnv(_config:Partial<ConfigShape>, env :NodeJS.ProcessEnv ){
  const envMap = {
    hostname: "PGHOST",
    port: "PGPORT",
    username: "PGUSER",
    password: "PGPASSWORD",
    pathname: "PGDATABASE",
  } as const satisfies Partial<Record<keyof Omit<URL, "toString">, string>>;

  // Socket mode: no host AND no password → use Unix domain socket for local development
  if(!env[envMap.hostname] && !env[envMap.password]){
    return `socket:///var/run/postgresql/${env[envMap.pathname]? `?db=${env[envMap.pathname]}`:""}`;
  }

  // TCP mode: either host or password present → connect via TCP
  const db_uri = new URL(`postgres://localhost:5432/${process.env["USER"]}`);
  for(let [key, name] of Object.entries(envMap)){
    if(!env[name]) continue;
    (db_uri as any)[key] = env[name];
  }
  return db_uri.toString();
}

/**
 * Parses a set of environment variables into a raw config shape.
 */
export function parse(env :NodeJS.ProcessEnv = process.env):ConfigShape{
  let c :Partial<ConfigShape>  = {};
  for(let [key, [defaultValue, optionType]] of Object.entries(_all_values)){
    const validate = validatorMap[optionType as OptionType];
    let env_value = env[`${key.toUpperCase()}`];
    if(typeof env_value !== "undefined"){
      c[key as Key] = validate(env_value) as any;
    }else{
      c[key as Key] = (typeof defaultValue !=="function")? defaultValue: defaultValue(c as any, env) as any;
    }
  }
  return c as ConfigShape;
}

/**
 * Static config only.
 * Where possible, use of the {@link Config} class should be preferred
 */
const static_config = Object.freeze(parse()) as Readonly<StaticConfigShape>;
export default static_config;


// Interface-class merge: tells TypeScript that Config instances satisfy ConfigShape
// without requiring explicit property declarations for each key.

export class Config {
  static #instance: Config|null = null;
  private _values = new Map<Key, ConfigEntry>();
  constructor(
    private readonly _db: Database,
    env: Readonly<NodeJS.ProcessEnv>,
  ){
    for(let [_key, [defaultFactory, optionType]] of Object.entries(_all_values)){
      const key = _key as Key;
      const validate = validatorMap[optionType as OptionType];
      const type = htmlTypeMap[optionType as OptionType];
      let env_value = env[`${key.toUpperCase()}`];
      let defaultValue = (typeof defaultFactory !=="function")? defaultFactory: defaultFactory(static_config as any, env) as any;
      if(typeof env_value !== "undefined"){
        this._values.set(key,{
          value: validate(env_value) as any,
          locked: true,
          type,
          defaultValue
        });
      }else{
        this._values.set(key, {
          value: defaultValue,
          locked: !(key in runtime_values),
          type,
          defaultValue
        });
      }
    }
  }

  toJSON(): ConfigShape {
    const out: any = {};
    for(const key of Object.keys(_all_values) as (keyof typeof _all_values)[])
      out[key] = this.get(key);
    return out as ConfigShape;
  }

  [Symbol.iterator](){
    return this.entries();
  }

  entries(){
    return this._values.entries();
  }

  *runtimeEntries(){
    for(let key in runtime_values){
      yield [key, this._values.get(key as any)]
    }
  }
  *staticEntries(){
    for(let key in static_values){
      yield [key, this._values.get(key as any)]
    }
  }

  async reload(){
    const rows = await this._db.all<{name: RKey, value: string}>(
      `SELECT name, value FROM config WHERE name = ANY($1::text[])`,
      [Object.keys(runtime_values).filter(k=> !this._values.get(k as any)?.locked)]
    );
    for(let row of rows){
      const prev = this._values.get(row.name);
      if(!prev) throw new Error(`Trying to update ${row.name}, which wasn't found in records. This is not supposed to happen`);
      if(prev.locked) throw new Error(`Trying to update ${row.name}, which is locked. This is not supposed to happen`);
      const [, optionType] = _all_values[row.name];
      this._values.set(row.name, {
        ...prev,
        value: (validatorMap as any)[optionType](row.value)
      });
    }
  }

  /**
   * Create a config that also loads runtime values from the database.
   * Call this after the database connection is established.
   */
  static async open(db: Database, env: NodeJS.ProcessEnv = process.env): Promise<Config> {
    if(Config.#instance ) throw new Error("Config is a system singleton. One instance already exists")

    const c = new Config(db, env);
    await c.reload();
    Config.#instance = c;
    return c;
  }

  static close(){
    Config.#instance = null;
  }

  static get<T extends Key>(key: T): ValueType<T>{
    if(!this.#instance){
      if(key in static_values) return (static_config as any)[key];
      else throw new Error(`Config singleton hasn't been initialized`);
    }
    return this.#instance!.get(key);
  }

  get<T extends Key>(key: T): ValueType<T>{
    const _v = this._values.get(key) as ConfigEntry<T>;
    if(!_v) throw new Error(`Couldn't get config for key ${key}`);
    return _v.value;
  }

  /**
   * Persist a runtime value to the database and update the in-memory cache.
   * Only keys defined in runtime_values are accepted.
   *
   * @returns true if value has changed. false if it was equal or value is locked from environment
   */
  async set<K extends RKey>(key: K, value: ConfigShape[K]): Promise<boolean> {
    const raw = String(value);
    const optionType = runtime_values[key]?.[1] as OptionType | undefined;
    if(typeof optionType === "undefined") throw new Error(`Invalid runtime configuration key : ${key}`);
    const validate = validatorMap[optionType];
    // validate — throws if the string can't round-trip through the validator
    if(validate(raw) != value) throw new Error(`Serialization of ${value} is not indempotent for configuration key ${key}`);

    await this._db.run(
      `INSERT INTO config(name, value) VALUES($1, $2)
       ON CONFLICT(name) DO UPDATE SET value = EXCLUDED.value`,
      [key, raw]
    );
    const entry = this._values.get(key);
    if(entry && !entry.locked && entry.value !== value){
      this._values.set(key, {...entry, value});
      return true;
    }else{
      return false;
    }
  }

  /**
   * Check if a configuration value can be changed with {@link set } or is locked from an enviropnment value
   * @param k
   * @returns
   */
  locked(k: RKey){
    return this._values.get(k)?.locked;
  }
}

import path from "path"
import {hostname} from "os";


const values = {
  node_env:["development", toString],
  public: [true, toBool],
  brand: ["eCorpus", toString],
  port: [8000, toListenTarget ],
  force_migration: [false, toBool],
  clean_database: [true, toBool],
  root_dir: [ process.cwd(), toPath],
  migrations_dir: [path.join(process.cwd(),"migrations"), toPath],
  templates_dir: [path.join(process.cwd(),"templates"), toPath],
  scripts_dir: [path.join(process.cwd(),"scripts"), toPath],
  files_dir: [({root_dir}:{root_dir:string})=> path.resolve(root_dir,"files"), toPath],
  dist_dir: [({root_dir}:{root_dir:string})=> path.resolve(root_dir,"dist"), toPath],
  assets_dir: [undefined, toPath],
  database_uri: [parsePGEnv, toString],
  trust_proxy: [true, toBool],
  hostname: [hostname(), toString],
  contact_email: [({hostname}:{hostname: string})=> "noreply@"+hostname, toString],
  smart_host: ["smtp://localhost", toString],
  verbose: [false, toBool],
  build_ref: [undefined, toString],

  experimental: [false, toBool],
  /// FEATURE FLAGS ///
  enable_document_merge: [isExperimental, toBool],
  with_ktx: [isExperimental, toBool],
  with_blender: [isExperimental, toBool],
  enable_rebake_textures: [({experimental, with_blender}: {experimental: boolean, with_blender: boolean})=> (experimental && with_blender), toBool],
  
} as const;


type Key = keyof typeof values;
type ValueType<T extends Key> = ReturnType<typeof values[T][1]>;
export type Config = {
  [T in Key]: typeof values[T][0] extends BuildKey<T>? ReturnType<typeof values[T][0]> : ValueType<T>;
}

type BuildKey<T extends Key> = (c :Partial<Omit<{[U in Key]: ValueType<U>}, T>>, env: NodeJS.ProcessEnv) => ValueType<T>;



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
  return !(!s || ["false", "0", "no"].indexOf(s.toLowerCase()) !== -1);
}

/**
 * used to default a value to "false", unless EXPERIMENTAL flag is set
 */
function isExperimental({experimental}: {experimental: boolean}) :boolean{
  return experimental;
}




function parsePGEnv(_config:Partial<Config>, env :NodeJS.ProcessEnv ){
  const envMap = {
    hostname: "PGHOST",
    port: "PGPORT",
    username: "PGUSER",
    password: "PGPASSWORD",
    pathname: "PGDATABASE",
  } as const satisfies Partial<Record<keyof Omit<URL, "toString">, string>>;

  if(!env[envMap.hostname] && !env[envMap.password!]){
    return `socket:///var/run/postgresql/${env[envMap.pathname]? `?db=${env[envMap.pathname]}`:""}`;
  }

  const db_uri = new URL(`postgres://localhost:5432/${process.env["USER"]}`);
  for(let [key, name] of Object.entries(envMap)){
    if(!env[name]) continue;
    (db_uri as any)[key] = env[name];
  }
  return db_uri.toString();
}

/**
 * Parses a set of environment variables into a configuration object
 */
export function parse(env :NodeJS.ProcessEnv = process.env):Config{
  let c :Partial<Config>  = {};
  for(let [key, [defaultValue, validate]] of Object.entries(values)){
    let env_value = env[`${key.toUpperCase()}`];
    if(typeof env_value !== "undefined"){
      c[key as Key] = validate(env_value) as any;
    }else{
      c[key as Key] = (typeof defaultValue !=="function")? defaultValue: defaultValue(c as any, env) as any;
    }
  }
  return c as Config;
}

export default Object.freeze(parse());

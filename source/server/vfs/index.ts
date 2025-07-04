import fs from "fs/promises";
import path from "path";
import open, {Database} from "./helpers/db.js";


import BaseVfs from "./Base.js";
import FilesVfs from "./Files.js";
import ScenesVfs from "./Scenes.js";
import CleanVfs from "./Clean.js";
import StatsVfs from "./Stats.js";
import TagsVfs from "./Tags.js";

export * from "./types.js";


interface VfsOptions{
  db ?:Database;
  database_uri?:string;
  createDirs?:boolean;
  forceMigration ?:boolean;
}

/**
 * Virtual filesystem interactions.
 * Wraps calls in necessary locks and checks to prevent file corruption
 */
class Vfs extends BaseVfs{
  public isOpen :boolean = true;

  constructor(protected rootDir :string, protected db :Database){
    super(rootDir, db);
  }
  static async Open(rootDir :string, opts :VfsOptions&Required<Pick<VfsOptions,"db">>):Promise<Vfs>
  static async Open(rootDir :string, opts:VfsOptions&Required<Pick<VfsOptions,"database_uri">> ):Promise<Vfs>
  static async Open(rootDir :string, {db, database_uri, createDirs=true, forceMigration = true} :VfsOptions = {} ){
    if(!db && !database_uri) throw new Error(`No DB connection method provided. Can't open VFS`);
    if(createDirs){
      await fs.mkdir(path.join(rootDir, "objects"), {recursive: true});
      await fs.rm(path.join(rootDir, "uploads"), {recursive: true, force: true});
      await fs.mkdir(path.join(rootDir, "uploads"), {recursive: true});
    }
    db ??= await open({
      uri: database_uri!,
      forceMigration,
    });

    let vfs = new Vfs(rootDir, db);
    return vfs;
  }
  
  async close(){
    await this.db.end();
    this.isOpen = false;
  }
}

interface Vfs extends FilesVfs, ScenesVfs, StatsVfs, TagsVfs, CleanVfs {};
applyMixins(Vfs, [FilesVfs, ScenesVfs, StatsVfs, TagsVfs, CleanVfs]);

export default Vfs;


/**
 * ad-hoc function to merge subclasses
 */
function applyMixins(derivedCtor: any, constructors: any[]) {
  constructors.forEach((baseCtor) => {
    Object.getOwnPropertyNames(baseCtor.prototype).forEach((name) => {
      Object.defineProperty(
        derivedCtor.prototype,
        name,
        Object.getOwnPropertyDescriptor(baseCtor.prototype, name) ||
          Object.create(null)
      );
    });
  });
}

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
  createDirs?:boolean;
  forceMigration ?:boolean;
}

/**
 * Virtual filesystem interactions.
 * Wraps calls in necessary locks and checks to prevent file corruption
 */
class Vfs extends BaseVfs{

  constructor(protected rootDir :string, protected db :Database){
    super(rootDir, db);
  }
  public get isOpen(){
    return !!this.db;
  }

  static async Open(rootDir :string, {db, createDirs=true, forceMigration = true} :VfsOptions = {} ){
    if(createDirs){
      await fs.mkdir(path.join(rootDir, "objects"), {recursive: true});
      await fs.rm(path.join(rootDir, "uploads"), {recursive: true, force: true});
      await fs.mkdir(path.join(rootDir, "uploads"), {recursive: true});
    }
    db ??= await open({
      filename: path.join(rootDir,'database.db'),
      forceMigration,
    });

    let vfs = new Vfs(rootDir, db);
    return vfs;
  }
  
  async close(){
    await this.db.close();
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

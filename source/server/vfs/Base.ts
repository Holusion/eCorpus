
import open, {Database, DbController} from "./helpers/db.js";
import path from "path";
import { InternalError, NotFoundError } from "../utils/errors.js";
import { FileProps } from "./types.js";


export type Isolate<that, T> = (this: that, vfs :that)=> Promise<T>;

export default abstract class BaseVfs extends DbController{

  constructor(protected rootDir :string, db :Database){
    super(db);
  }
  /**
   * Temporary directory to store in-transit files.
   * should be in the same volume as `Vfs.objectsDir` and `Vfs.artifactsDir`
   * to ensure files can be moved atomically between those folders.
   */
  public get uploadsDir(){ return path.join(this.rootDir, "uploads"); }
  /**
   * Main objects directory
   */
  public get objectsDir(){ return path.join(this.rootDir, "objects"); }
  /**
   * Secondary directory used to store task artifacts
   * Those are not considered long-term persistent: They can be cleaned-up to save space.
   * On the other hand, they _shouldn't_ be cleaned before their referencing task
   */
  public get artifactsDir(){ return path.join(this.rootDir, "artifacts"); }

  public filepath(f :FileProps|string|{hash:string}){
    if(typeof f ==="string"){
      return path.join(this.objectsDir, f);
    }else if(f.hash){
      return path.join(this.objectsDir, f.hash)
    }else{
      throw new NotFoundError(`No file matching ${f}`);
    }
  }

  abstract close() :Promise<any>;
  public abstract isOpen :boolean;
}
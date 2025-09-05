
import open, {Database, DbController} from "./helpers/db.js";
import path from "path";
import { InternalError, NotFoundError } from "../utils/errors.js";
import { FileProps } from "./types.js";


export type Isolate<that, T> = (this: that, vfs :that)=> Promise<T>;

export default abstract class BaseVfs extends DbController{

  constructor(protected rootDir :string, db :Database){
    super(db);
  }

  public get uploadsDir(){ return path.join(this.rootDir, "uploads"); }
  public get objectsDir(){ return path.join(this.rootDir, "objects"); }

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
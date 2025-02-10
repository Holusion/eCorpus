
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

  /**
   * Runs a sequence of methods in isolation
   * Every calls to Vfs.db inside of the callback will be seriualized and wrapped in a transaction
   * 
   * @see Database.beginTransaction
   */
  public async isolate<T>(fn :Isolate<typeof this, T>) :Promise<T>{
    const parent = this;
    return await this.db.beginTransaction(async function isolatedTransaction(transaction){
      let closed = false;
      let that = new Proxy<typeof parent>(parent, {
        get(target, prop, receiver){
          if(prop === "db"){
            return transaction;
          }else if (prop === "isOpen"){
            return !closed;
          }
          return Reflect.get(target, prop, receiver);
        }
      });
      try{
        return await fn.call(that, that);
      }finally{
        closed = true;
      }
    }) as T;
  }
  
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
    /**
 * Converts a date as stored by sqlite into a js Date object
 * Necessary because sqlite applies the ISO standard and omits the "Z" for UTC generated timestamps, 
 * while JS applies consider these timestamps as localtime
 * @param str 
 * @returns 
 */
  static toDate(str :string){
    // Matches Z | ±HH:mm at the end of string
    let m = /^(\d{4}|[+\-]\d{6})(?:-(\d{2})(?:-(\d{2}))?)?(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{3}))?)?(?<timezone>(Z)|([+\-])(\d{2})(?::(\d{2}))?)?)?$/.exec(str)
    if(!m) throw new InternalError("Badly formatted date : "+str);
    return new Date(((m.groups as any).timezone? str: str+"Z"));
  }
}
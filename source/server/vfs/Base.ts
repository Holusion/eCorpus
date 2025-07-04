
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
   * Every calls to this.db (or `transaction.db`) inside of the callback will use the same database client to allow proper transaction
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
}
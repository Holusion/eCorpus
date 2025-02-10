
import {open as openDatabase, ISqlite, Database as IDatabase } from "sqlite";
import sqlite from "sqlite3";
import config from "../../utils/config.js";
import { debuglog } from "util";
import uid from "../../utils/uid.js";

export interface DbOptions {
  filename:string;
  forceMigration ?:boolean;
}

interface TransactionWork<T>{
  (db :Transaction) :Promise<T>;
}
export interface Database extends IDatabase{
  /**
   * opens a new connection to the database to perform a transaction
   */
  beginTransaction :(<T>(work :TransactionWork<T>, commit ?:boolean)=>Promise<T>);
}
export interface Transaction extends Database{}

async function openAndConfigure({filename} :DbOptions){
  let db = await openDatabase({
    filename,
    driver: sqlite.Database, 
    mode: 0
      | sqlite.OPEN_URI
      | sqlite.OPEN_CREATE
      | sqlite.OPEN_READWRITE
  });
  await db.run("PRAGMA journal_mode = WAL");
  await db.run("PRAGMA synchronous = normal");
  await db.run("PRAGMA temp_store = memory");
  await db.run(`PRAGMA mmap_size = ${100 * 1000 /*kB*/ * 1000 /*MB*/}`);
  await db.run(`PRAGMA page_size = 32768`);
  await db.run(`PRAGMA busy_timeout = 500`);
  await db.run(`PRAGMA foreign_keys = ON`);
  return db;
}

export default async function open({filename, forceMigration=true} :DbOptions) :Promise<Database> {
  let db = await openAndConfigure({
    filename,
  });
  
  await db.run(`PRAGMA foreign_keys = OFF`);
  await db.migrate({
    force: forceMigration,
    migrationsPath: config.migrations_dir,
  });
  await db.run(`PRAGMA foreign_keys = ON`);
  
  if(debuglog("sqlite:verbose").enabled)sqlite.verbose();
  if(debuglog("sqlite:profile").enabled){
    const log = debuglog("sqlite:profile");
    db.on("profile",log); 
  }
  if(debuglog("sqlite:trace").enabled){
    const log = debuglog("sqlite:trace");
    db.on("trace", log); 
  }
  

  async function performTransaction<T>(this:Database|Transaction, work :TransactionWork<T>, commit :boolean=true):Promise<T>{
    let transaction_id = uid();
    // See : https://www.sqlite.org/lang_savepoint.html
    if(commit) await this.run(`SAVEPOINT VFS_TRANSACTION_${transaction_id}`);
    try{
      let res = await work(this);
      if(commit) await this.run(`RELEASE SAVEPOINT VFS_TRANSACTION_${transaction_id}`);
      return res;
    }catch(e){
      if(commit){
        await this.run(`ROLLBACK TRANSACTION TO VFS_TRANSACTION_${transaction_id}`);
        await this.run(`RELEASE SAVEPOINT VFS_TRANSACTION_${transaction_id}`);
      }
      throw e;
    }
  }

  (db as Database).beginTransaction = async function beginTransaction<T>(work :TransactionWork<T>, commit :boolean = true):Promise<T>{
    let conn = await openAndConfigure({filename: db.config.filename}) as Transaction;
    conn.beginTransaction = performTransaction.bind(conn) as any;
    try{
      return await (performTransaction as typeof performTransaction<T>).call(conn, work, commit);
    }finally{
      //Close will automatically rollback the transaction if it wasn't committed
      await conn.close();
    }
  };
  return db as Database;
}


export type Isolate<that, T> = (this: that, vfs :that)=> T|Promise<T>;

/**
 * Base class to centralize database handling functions.
 * Mainly: assigning an internal "db" property and setting up an isolate function
 */
export class DbController{

    /**
     * Direct-access to the underlying database
     * Shouldn't be used outside of tests
     */
  public get _db(){
    return this.db;
  }
  constructor(protected db:Database){}
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
}
  
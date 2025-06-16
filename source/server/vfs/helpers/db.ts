import timers from 'timers/promises';
import {open as openDatabase, ISqlite, Database as IDatabase } from "sqlite";
import sqlite from "sqlite3";
import config from "../../utils/config.js";
import { debuglog } from "util";
import uid from "../../utils/uid.js";

export interface DbOptions {
  filename:string;
  forceMigration ?:boolean;
  busyTimeout?:number;
}

export interface TransactionConfig{
  retries?:number;
  retryTimeout?:number;
  timeout?:number;
}

interface TransactionWork<T>{
  (db :Transaction) :Promise<T>;
}
export interface Database extends IDatabase{
  /**
   * opens a new connection to the database to perform a transaction
   */
  beginTransaction :(<T>(work :TransactionWork<T>, config?: TransactionConfig)=>Promise<T>);
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
  

  async function performTransaction<T>(this:Database|Transaction, work :TransactionWork<T>, {
    retries=0,
    retryTimeout=10+10*Math.random(),
  }:TransactionConfig ={}):Promise<T>{
    let work_id = uid();
    let last_error: Error;
    for(let i = 0; i <= retries; i++){
      const transaction_id = `${work_id}_${i}`;
      if(i != 0){
        debuglog("sqlite:transactions")(`Retrying transaction ${transaction_id}`);
        await timers.setTimeout(retryTimeout*i);
      }
      // See : https://www.sqlite.org/lang_savepoint.html
      await this.run(`SAVEPOINT VFS_TRANSACTION_${transaction_id}`);
      try{
        return await work(this);
      }catch(e:any){
        console.log(`${transaction_id}: rollback due to ${e.code}`);
        await this.run(`ROLLBACK TO SAVEPOINT VFS_TRANSACTION_${transaction_id}`);
        if(e.code !== "SQLITE_BUSY")throw e;
        last_error = e;
      }finally{
        console.time(`${transaction_id}: release`);
        await this.run(`RELEASE SAVEPOINT VFS_TRANSACTION_${transaction_id}`);
        console.timeEnd(`${transaction_id}: release`);
      }
    }
    throw last_error!;
  }

  (db as Database).beginTransaction = async function beginTransaction<T>(work :TransactionWork<T>, config?: TransactionConfig):Promise<T>{
    let conn = await openAndConfigure({filename: db.config.filename}) as Transaction;
    conn.beginTransaction = performTransaction.bind(conn) as any;
    try{
      return await (performTransaction as typeof performTransaction<T>).call(conn, work, config);
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
  public async isolate<T>(fn :Isolate<typeof this, T>, config?: TransactionConfig) :Promise<T>{
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
    }, config) as T;
  }
}
  
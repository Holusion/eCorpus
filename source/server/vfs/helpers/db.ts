
import {open as openDatabase, ISqlite, Database as IDatabase } from "sqlite";
import sqlite from "sqlite3";
import config from "../../utils/config.js";

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

async function openAndConfigure({filename, forceMigration=true} :DbOptions){
  let db = await openDatabase({
    filename,
    driver: sqlite.Database, 
    mode: sqlite.OPEN_URI|sqlite.OPEN_CREATE|sqlite.OPEN_READWRITE,
  });
  //Must be run with each connections
  await db.run(`PRAGMA foreign_keys = ON`);
  await db.run(`PRAGMA synchronous = NORMAL`);
  return db;
}


export default async function open({filename, forceMigration=true} :DbOptions) :Promise<Database> {
  let db = await openAndConfigure({
    filename,
  });
  
  await db.migrate({
    force: forceMigration,
    migrationsPath: config.migrations_dir,
  });
  
  async function performTransaction<T>(this:Database|Transaction, work :TransactionWork<T>, commit :boolean=true):Promise<T>{
    // See : https://www.sqlite.org/lang_savepoint.html
    if(commit) await this.run(`SAVEPOINT VFS_TRANSACTION`);
    try{
      let res = await work(this);
      if(commit) await this.run("RELEASE SAVEPOINT VFS_TRANSACTION");
      return res;
    }catch(e){
      if(commit) await this.run("ROLLBACK TRANSACTION TO VFS_TRANSACTION").catch(e=>{});
      throw e;
    }
  }

  (db as Database).beginTransaction = async function<T>(work :TransactionWork<T>, commit :boolean = true):Promise<T>{
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

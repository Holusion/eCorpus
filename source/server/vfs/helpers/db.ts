import {Pool, QueryResultRow} from 'pg';
import config from "../../utils/config.js";
import { debuglog } from "util";
import uid from "../../utils/uid.js";
import Cursor from 'pg-cursor';

export interface DbOptions {
  uri:string;
  forceMigration ?:boolean;
}

interface TransactionWork<T>{
  (db :Transaction) :Promise<T>;
}

export interface Transaction extends Database{}

export interface RunResult{
  changes:number|null;
}

export interface DatabaseHandle{
  get<T extends QueryResultRow =any>(sql: string, params?: any):Promise<T>;
  all<T extends QueryResultRow =any>(sql: string, params?: any):Promise<T[]>;
  run(sql: string, params?: any):Promise<RunResult>;
  beginTransaction<T>(work:(db: DatabaseHandle)=>Promise<T>):Promise<T>;
}

export interface Database extends DatabaseHandle{
  end:()=>Promise<void>
}


export default async function open({uri, forceMigration=true} :DbOptions) :Promise<Database> {

  let pool = new Pool({connectionString: uri});
  
  // await db.run(`PRAGMA foreign_keys = OFF`);
  // await db.migrate({
  //   force: forceMigration,
  //   migrationsPath: config.migrations_dir,
  // });
  // await db.run(`PRAGMA foreign_keys = ON`);
  
  // if(debuglog("sqlite:verbose").enabled)sqlite.verbose();
  // if(debuglog("sqlite:profile").enabled){
  //   const log = debuglog("sqlite:profile");
  //   db.on("profile",log); 
  // }
  // if(debuglog("sqlite:trace").enabled){
  //   const log = debuglog("sqlite:trace");
  //   db.on("trace", log); 
  // }
  
  return {
    async all<T extends QueryResultRow = any>(sql:string, params?: any):Promise<T[]>{
      const {rows} = await pool.query<T, any>(sql, params);
      return rows;
    },
    async get<T extends QueryResultRow = any>(sql:string, params?: any):Promise<T>{
      const client = await pool.connect();
      const cursor = client.query(new Cursor<T>(sql, params));
      try{
        return (await cursor.read(1))[0];
      }finally{
        await cursor.close();
        client.release();
      }
    },
    async run(sql: string, params?: any):Promise<RunResult>{
      const r = await pool.query<never, any>(sql, params);
      return {
        changes: r.rowCount,
      };

    },
    async beginTransaction<T>(work:(db:DatabaseHandle)=>Promise<T>): Promise<T>{
      const client = await pool.connect();
      try{
        return await work({
          async all<T extends QueryResultRow = any>(sql:string, params:any):Promise<T[]>{
            const {rows} = await client.query<T, any>(sql, params);
            return rows;
          },
          async get<T extends QueryResultRow = any>(sql:string, params:any):Promise<T>{
            const cursor = client.query(new Cursor<T>(sql, params));
            try{
              return (await cursor.read(1))[0];
            }finally{
              await cursor.close();
            }
          },
          async run(sql: string, params: any):Promise<RunResult>{
            const r = await client.query<never, any>(sql, params);
            return {
              changes: r.rowCount,
            };
      
          },
          async beginTransaction<T>(work:(db:DatabaseHandle)=>Promise<T>):Promise<T>{
            return await work(this);
          }
        });
      }finally{
        client.release();
      }

    },
    async end(){
      return await pool.end();
    }
  } satisfies Database;
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
  
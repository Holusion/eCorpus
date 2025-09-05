import {Client, ClientBase, Pool, PoolClient, PoolConfig, QueryResultRow, types as pgtypes} from 'pg';
import config from "../../utils/config.js";
import Cursor from 'pg-cursor';
import { migrate } from './migrations.js';
import { debuglog } from 'node:util';
import { expandSQLError } from './errors.js';


export interface DbOptions {
  uri:string;
  forceMigration ?:boolean;
}


export interface RunResult{
  changes:number|null;
}


pgtypes.setTypeParser(20 /* BIGINT */, function parseBigInt(val){
  return parseInt(val, 10);
});

const debug = debuglog("pg:trace");

function safeDebugError(e:Error|unknown, sql: string){
  try{
    debug(expandSQLError(e, sql).toString());
  }catch(e){
    debug(`Failed to expand SQL error `, e);
  }
}

export interface DatabaseHandle{
  /**
   * Creates a cursor that will only fetch the first row that would be returned by the query
   */
  get<T extends QueryResultRow =any>(sql: string, params?: any[]):Promise<T>;
  /**
   * Query the database, return the result as an array of rows
   */
  all<T extends QueryResultRow =any>(sql: string, params?: any[]):Promise<T[]>;
  /**
   * Run a query, ignoring any results
   */
  run(sql: string, params?: any[]):Promise<RunResult>;

  each<T extends QueryResultRow = any>(sql: string, params?: any[]):AsyncGenerator<T, void, void>;

  /**
   * Start a transaction. A connection will be reserved for the entire transaction's duration.
   * Can be nested: Savepoints will be used to allow recovering from errors in nested transactions.
   */
  beginTransaction<T>(work:(db: DatabaseHandle)=>Promise<T>):Promise<T>;
}

export interface Transaction extends DatabaseHandle{}
export interface Database extends DatabaseHandle{
  end:()=>Promise<void>
}

export function toHandle(db:Pool|PoolClient|Client) :Omit<DatabaseHandle, "beginTransaction">{
  
  return {
    async all<T extends QueryResultRow = any>(sql:string, params?: any[]):Promise<T[]>{
      try{
        const {rows} = await db.query<T, any>(sql, params);
        return rows;
      }catch(e){
        safeDebugError(e, sql);
        throw e;
      }
    },
    async get<T extends QueryResultRow = any>(sql:string, params?: any[]):Promise<T>{
      const client = await ((db instanceof Pool)? (db as Pool).connect(): db);
      const cursor = client.query(new Cursor<T>(sql, params));
      try{
        return (await cursor.read(1))[0];
      }catch(e){
        safeDebugError(e, sql);
        throw e;
      }finally{
        await cursor.close();
        if((db instanceof Pool)) (client as PoolClient).release();
      }
    },
    async run(sql: string, params?: any[]):Promise<RunResult>{
      try{
        const r = await db.query<never, any>(sql, params);
        return {
          changes: r.rowCount,
        };
      }catch(e){
        safeDebugError(e, sql);
        throw e;
      }
    },

    async *each<T extends QueryResultRow = any>(sql:string, params:any[]):AsyncGenerator<T,void, never>{
      const client = await ((db instanceof Pool)? (db as Pool).connect(): db);
      const cursor = client.query(new Cursor<T>(sql, params));
      try{
        while(true){
          const rows = await cursor.read(100);
          if(rows.length == 0) break;
          yield* rows;
        }
      }catch(e){
        safeDebugError(e, sql);
        throw e;
      }finally{
        await cursor.close();
        if((db instanceof Pool)) (client as PoolClient).release();
      }
    },
  }
}


let _id :number = 0;
export default async function open({uri, forceMigration=true} :DbOptions) :Promise<Database> {
  debug("connect to database at : "+ uri)
  let pool = new Pool({connectionString: uri});

  pool.on("error", (err, client)=>{
    console.error("psql client pool error :", err);
  });
  
  
  let handle = {
    ...toHandle(pool),
    async beginTransaction<T>(work:(db:DatabaseHandle)=>Promise<T>): Promise<T>{
      const client = await pool.connect();
      try{
        await client.query(`BEGIN TRANSACTION`);
        const res = await work({
          ...toHandle(client),
          async beginTransaction<T>(work:(db:DatabaseHandle)=>Promise<T>):Promise<T>{
            const sp = `SP_${(++_id).toString(16)}`;
            await client.query(`SAVEPOINT ${sp}`);
            try{
              return await work(this);
            }catch(e){
              try{
                await client.query(`ROLLBACK TRANSACTION TO ${sp}`);
              }catch(e:any){
                console.error(new Error(`Failed to rollback transaction: `+e.message));
              }
              throw e;
            }finally{
              await client.query(`RELEASE SAVEPOINT ${sp}`);
            }
          }
        });
        await client.query(`COMMIT TRANSACTION`);
        return res;
      }catch(e){
       await client.query('ROLLBACK TRANSACTION');
       throw e;
      }finally{
        client.release();
      }

    },
    async end(){
      return await pool.end();
    }
  } satisfies Database;

  let client :PoolClient;
  try{
    client = await pool.connect();
  }catch(e:any){
    if(debug.enabled && Array.isArray(e.errors)){
      e.errors.forEach((err:any)=> debug(err));
    }
    if(e.code === "ECONNREFUSED"){
      let safeUri = new URL(uri);
      if(safeUri.username) safeUri.username = "***";
      if(safeUri.password) safeUri.password = "***";
      //Database name is not considered sensitive information
      throw new Error(`database connect ECONNREFUSED at : ${safeUri}`);
    }
    //Pool can throw an AggregateError that has an errors array property
    throw new Error(`Failed to connect to database: ${e.errors? e.errors.map((e:any)=>e.message).join("\n"): e.message}`);
  }
  
  try{
    await migrate({db:client, migrations: config.migrations_dir, force: forceMigration});
  }finally{
    client.release()
  }

  return handle;
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
   * Every calls to Vfs.db inside of the callback will be wrapped in a transaction
   * 
   * Can be combined through multiple DbController instances. For example: 
   * ```javascript
   * vfs.isolate(async vfs =>{
   *  return userManager.isolate(vfs, async (userManager)=>{
   *    //Here both `userManager` and `vfs` will execute queries within the explicit transaction
   *  })
   * })
   * @see Database.beginTransaction
   */
  public async isolate<T>(controller: DbController, fn :Isolate<typeof this, T>) :Promise<T>
  public async isolate<T>(fn :Isolate<typeof this, T>) :Promise<T>
  public async isolate<T>(fnOrController :DbController|Isolate<typeof this, T>, fnParam?:Isolate<typeof this, T>) :Promise<T>{
    const controller = (typeof fnOrController == "object" && typeof fnParam !== "undefined")? fnOrController : this;
    const fn = (typeof fnParam === "undefined" && typeof fnOrController === "function")? fnOrController: fnParam;
    if(!fn) throw new Error(`Can't call undefined isolate workload`);
    const parent = this;
    return await controller.db.beginTransaction(async function isolatedTransaction(transaction){
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

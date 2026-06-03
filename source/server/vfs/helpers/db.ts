import {Client, ClientBase, Pool, PoolClient, PoolConfig, QueryResultRow, types as pgtypes} from 'pg';
import staticConfig from "../../utils/config.js";
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
  if(!debug.enabled) return;
  try{
    debug(expandSQLError(e, sql).toString());
  }catch(e){
    debug(`Failed to expand SQL error `, e);
  }
}

export interface DatabaseHandle{
  /**
   * @deprecated this will not enforce a limit but just discard all results after the first
   * Creates a cursor that will only fetch the first row that would be returned by the query
   */
  get<T extends QueryResultRow =any>(sql: string, params?: any[]):Promise<T|undefined>;
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
    async get<T extends QueryResultRow = any>(sql:string, params?: any[]):Promise<T|undefined>{
      return (await this.all(sql, params))[0];
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
  let pool = new Pool({
    connectionString: uri,
    // a connection timeout is a bad thing to have.
    // But we don't want to hang forever if something is very wrong.
    connectionTimeoutMillis: 10000,
  });

  pool.on("error", (err, client)=>{
    console.error("psql client pool error :", err);
  });
  
  
  let handle = {
    ...toHandle(pool),
    async beginTransaction<T>(work:(db:DatabaseHandle)=>Promise<T>): Promise<T>{
      const client = await pool.connect();
      // When cleanup fails we can't safely return the client to the pool: the
      // session might still hold a transaction, a SET, or an aborted state.
      // Passing `true` to release() asks pg-pool to destroy the connection.
      let dirty = false;
      try{
        await client.query(`BEGIN TRANSACTION`);
        const res = await work({
          ...toHandle(client),
          async beginTransaction<T>(work:(db:DatabaseHandle)=>Promise<T>):Promise<T>{
            const sp = `SP_${(++_id).toString(16)}`;
            await client.query(`SAVEPOINT ${sp}`);
            let result :T;
            try{
              result = await work(this);
            }catch(e){
              try{
                await client.query(`ROLLBACK TRANSACTION TO ${sp}`);
                await client.query(`RELEASE SAVEPOINT ${sp}`);
              }catch(rbErr:any){
                // Savepoint cleanup failed: the outer transaction is unrecoverable.
                dirty = true;
                console.error(`Failed to roll back savepoint ${sp}: ${rbErr.message}`);
              }
              throw e;
            }
            await client.query(`RELEASE SAVEPOINT ${sp}`);
            return result;
          }
        });
        await client.query(`COMMIT TRANSACTION`);
        return res;
      }catch(e){
        if(!dirty){
          try{
            await client.query('ROLLBACK TRANSACTION');
          }catch(rbErr){
            // Don't let a failing ROLLBACK mask the original error.
            dirty = true;
          }
        }
        throw e;
      }finally{
        client.release(dirty);
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
    await migrate({db:client, migrations: staticConfig.migrations_dir, force: forceMigration});
  }finally{
    client.release()
  }

  return handle;
}




export type Isolate<that, T> = (this: that, vfs :that)=> T|Promise<T>;

export interface IsolateOptions{
  /**
   * When provided, every query issued through the isolated transaction first checks the signal
   * and throws `signal.reason` if it has been aborted. This neutralizes any write attempted after
   * cancellation: the transaction unwinds and rolls back instead of persisting partial changes.
   */
  signal ?:AbortSignal;
}

/**
 * Wraps a transaction handle so each query rejects with the abort reason once `signal` fires.
 * Nested (savepoint) transactions inherit the same guard.
 */
function withAbortSignal(handle :Transaction, signal :AbortSignal) :Transaction{
  const check = ()=>{ if(signal.aborted) throw (signal.reason ?? new Error("Operation aborted")); };
  return {
    all<T extends QueryResultRow = any>(sql:string, params?:any[]){ check(); return handle.all<T>(sql, params); },
    get<T extends QueryResultRow = any>(sql:string, params?:any[]){ check(); return handle.get<T>(sql, params); },
    run(sql:string, params?:any[]){ check(); return handle.run(sql, params); },
    each<T extends QueryResultRow = any>(sql:string, params?:any[]){ check(); return handle.each<T>(sql, params); },
    beginTransaction<T>(work:(db:DatabaseHandle)=>Promise<T>){ check(); return handle.beginTransaction<T>((inner)=> work(withAbortSignal(inner, signal))); },
  };
}

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
  public async isolate<T>(controller: DbController, fn :Isolate<typeof this, T>, opts ?:IsolateOptions) :Promise<T>
  public async isolate<T>(fn :Isolate<typeof this, T>, opts ?:IsolateOptions) :Promise<T>
  public async isolate<T>(a :DbController|Isolate<typeof this, T>, b ?:Isolate<typeof this, T>|IsolateOptions, c ?:IsolateOptions) :Promise<T>{
    let controller :DbController, fn :Isolate<typeof this, T>|undefined, opts :IsolateOptions|undefined;
    if(typeof a === "function"){
      controller = this; fn = a; opts = b as IsolateOptions|undefined;
    }else{
      controller = a; fn = b as Isolate<typeof this, T>|undefined; opts = c;
    }
    if(!fn) throw new Error(`Can't call undefined isolate workload`);
    const workload = fn; // const binding so it narrows inside the transaction closure
    const parent = this;
    const signal = opts?.signal;
    return await controller.db.beginTransaction(async function isolatedTransaction(transaction){
      let closed = false;
      const db = signal ? withAbortSignal(transaction, signal) : transaction;
      let that = new Proxy<typeof parent>(parent, {
        get(target, prop, receiver){
          if(prop === "db"){
            // Once isolate() has returned the connection is back in the pool —
            // continuing to query through `transaction` would hit a connection
            // now owned by someone else. Fail loudly instead.
            if(closed) throw new Error(`Use of an isolated controller after isolate() has returned`);
            return db;
          }else if (prop === "isOpen"){
            return !closed;
          }
          return Reflect.get(target, prop, receiver);
        }
      });
      try{
        return await workload.call(that, that);
      }finally{
        closed = true;
      }
    }) as T;
  }
}

import {Pool, QueryResultRow} from 'pg';
import config from "../../utils/config.js";
import Cursor from 'pg-cursor';
import { migrate } from './migrations.js';

export interface DbOptions {
  uri:string;
  forceMigration ?:boolean;
}


export interface RunResult{
  changes:number|null;
}

export interface DatabaseHandle{
  /**
   * Creates a cursor that will only fetch the first row that would be returned by the query
   */
  get<T extends QueryResultRow =any>(sql: string, params?: any):Promise<T>;
  /**
   * Query the database, return the result as an array of rows
   */
  all<T extends QueryResultRow =any>(sql: string, params?: any):Promise<T[]>;
  /**
   * Run a query, ignoring any results
   */
  run(sql: string, params?: any):Promise<RunResult>;

  each<T extends QueryResultRow = any>(sql: string, params?: any):AsyncGenerator<T, void, void>;

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

let _id :number = 0;
export default async function open({uri, forceMigration=true} :DbOptions) :Promise<Database> {
  let pool = new Pool({connectionString: uri});

  pool.on("error", (err, client)=>{
    console.error("psql client pool error :", err);
  });
  const client = await pool.connect();
  try{
    await migrate({db:client, migrations: config.migrations_dir, force: forceMigration});
  }finally{
    client.release();
  }
  
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

    async *each<T extends QueryResultRow = any>(sql:string, params:any):AsyncGenerator<T,void, never>{
      const client = await pool.connect();
      const cursor = client.query(new Cursor<T>(sql, params));
      try{
        while(true){
          const rows = await cursor.read(100);
          if(rows.length == 0) break;
          yield* rows;
        }
      }finally{
        await cursor.close();
        client.release();
      }
    },

    async beginTransaction<T>(work:(db:DatabaseHandle)=>Promise<T>): Promise<T>{
      const client = await pool.connect();
      try{
        await client.query(`BEGIN TRANSACTION`);
        const res = await work({
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

          async *each<T extends QueryResultRow = any>(sql:string, params:any):AsyncGenerator<T,void, never>{
            const cursor = client.query(new Cursor<T>(sql, params));
            try{
              while(true){
                const rows = await cursor.read(100);
                if(rows.length == 0) break;
                yield* rows;

              }
            }finally{
              await cursor.close();
            }
          },

          async beginTransaction<T>(work:(db:DatabaseHandle)=>Promise<T>):Promise<T>{
            const sp = `SP_${(++_id).toString(16)}`;
            await client.query(`SAVEPOINT ${sp}`);
            try{
              return await work(this);
            }catch(e){
              await client.query(`ROLLBACK TRANSACTION TO ${sp}`);
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
  
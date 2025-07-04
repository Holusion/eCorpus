import path from 'node:path';
import { readFile, readdir } from "node:fs/promises";
import { debuglog } from "node:util";

import { ClientBase } from "pg";

import errors, { expandSQLError } from "./errors.js";
import { DatabaseHandle } from './db.js';

const debug = debuglog("pg:migration");

export interface MigrationParams{
  db: DatabaseHandle,
  migrations: string,
  force: boolean,
}


async function listMigrations(dir:string):Promise<{id:number, name:string, filepath:string}[]>{
  try{
    return (await readdir(dir))
    .map(x => x.match(/^(\d+).(.*?)\.sql$/))
    .filter(x => x !== null)
    .map((x:any) => ({ id: Number(x[1]), name: x[2], filepath: path.join(dir, x[0]) }))
    .sort((a, b) => Math.sign(a.id - b.id));
  }catch(e: any){
    if(e.code == "ENOTDIR"){
      throw new Error(`Could not find migrations directory at ${dir}`)
    }
    throw e;
  }
}

async function parseMigration(file:string){
  const content = await readFile(file, {encoding: "utf-8"});
  const [up, down] = content.split(/^--\s+?down\b/im)

  return {
    up: up.replace(/^-- .*?$/gm, '').trim(),
    down: down ? down.trim() : '',
  }
}

export async function migrate({db, migrations: dir, force}: MigrationParams){
  const files = await listMigrations(dir);
  if(files.length == 0) throw new Error(`No migration files found in ${dir}`);
  await db.run(`
    CREATE TABLE IF NOT EXISTS "migrations" (
    id   INTEGER PRIMARY KEY,
    name TEXT    NOT NULL,
    up   TEXT    NOT NULL,
    down TEXT    NOT NULL
  );`);

  let records:{id:number, name:string, down:string}[] = (await db.all(`SELECT id, name, down FROM "migrations" ORDER BY id ASC`));
  
  try{
    //Undo any migration that has no file
    for(const record of records.slice().reverse()){
      if(files.find(m=>m.id === record.id)) continue;
      debug(`Undo migration ${record.id.toString(10).padStart(3, "0")}-${record.name} (file not found)`);
      try{
        await db.beginTransaction(async (tr)=>{
          await tr.run("SET CONSTRAINTS ALL DEFERRED");
          await tr.run(record.down);
        });
      }catch(e){
        throw expandSQLError(e, record.down, `migration record ${record.id.toString().padStart(3, "0")}-${record.name}`);
      }
      records = records.filter(r=>r.id!== record.id);
    }

    if(force && records.length){
      const lastMigration = records[records.length - 1];
      if(lastMigration){
        debug(`Undo migration ${lastMigration.id.toString(10).padStart(3, "0")}-${lastMigration.name} (forced)`);
        try{
          await db.beginTransaction(async (tr)=>{
            await tr.run("SET CONSTRAINTS ALL DEFERRED");
            await tr.run(lastMigration.down);
            await tr.run(`DELETE FROM migrations WHERE id = $1`, [lastMigration.id]);
          });

        }catch(e){
          throw expandSQLError(e, lastMigration.down, `migration record ${lastMigration.id.toString().padStart(3, "0")}-${lastMigration.name}`);
        }
        records = records.slice(0, -1);
      }
    }

    const lastMigrationId = records.length? records[records.length -1].id :0;
    for(let file of files){
      if(file.id <= lastMigrationId) continue;
      const m = await parseMigration(file.filepath);
      debug(`Apply migration ${path.basename(file.filepath)}`);
      try{
        await db.beginTransaction(async (tr)=>{
          await tr.run("SET CONSTRAINTS ALL DEFERRED");
          await tr.run(m.up);
        });
        await db.run(`
          INSERT 
          INTO migrations 
            (id, name, up, down)
          VALUES
            ($1, $2, $3, $4)
          `, [file.id, file.name, m.up, m.down]);
      }catch(e:any){
        throw expandSQLError(e, m.up, `file ${path.basename(file.filepath)}`);
      }
      
    }
  }catch(e:any){
    if(e.detail && debug.enabled) debug(`Erreur de migration : ${e.message}\n\t${e.detail}${e.hint?"\n\t"+e.hint:""}`);
    throw e;
  }
}
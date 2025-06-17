import path from 'node:path';
import { readFile, readdir } from "node:fs/promises";
import { debuglog } from "node:util";

import { ClientBase } from "pg";

import errors from "./errors.js";

const debug = debuglog("pg:migration");

export interface MigrationParams{
  db: ClientBase,
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
  let records:{id:number, name:string, down:string}[];
  try{
    records = (await db.query(`SELECT id, name, down FROM "migrations" ORDER BY id ASC`)).rows;
  }catch(e:any){
    if(e.code !== errors.undefined_table) throw e;
    await db.query(`
      CREATE TABLE IF NOT EXISTS "migrations" (
      id   INTEGER PRIMARY KEY,
      name TEXT    NOT NULL,
      up   TEXT    NOT NULL,
      down TEXT    NOT NULL
    );`);
    records = [];
  }



  await db.query("BEGIN TRANSACTION");
  try{
    //Undo any migration that has no file
    for(const record of records.slice().reverse()){
      if(files.find(m=>m.id === record.id)) continue;
      debug(`Undo migration ${record.id.toString(10).padStart(3, "0")}-${record.name} (file not found)`);
      await db.query(record.down);
      records = records.filter(r=>r.id!== record.id);
    }


    if(force && records.length){
      const lastMigration = records[records.length - 1];
      if(lastMigration){
        debug(`Undo migration ${lastMigration.id.toString(10).padStart(3, "0")}-${lastMigration.name} (forced)`);
        await db.query(lastMigration.down);
        await db.query(`DELETE FROM migrations WHERE id = $1`, [lastMigration.id]);
        records = records.slice(0, -1);
      }
    }
    const lastMigrationId = records.length? records[records.length -1].id :0;
    for(let file of files){
      if(file.id <= lastMigrationId) continue;
      const m = await parseMigration(file.filepath);
      debug(`Apply migration ${path.basename(file.filepath)}`);
      try{
        await db.query(m.up);
      }catch(e:any){
        //Keep only syntax errors class

        if(!e.position) throw e;
        const position = parseInt(e.position);
        if(Number.isNaN(position)) throw e;
        const lines_before = m.up.slice(0, position).split('\n');
        const before = lines_before.slice(-2);
        const after = m.up.slice(position).split('\n').shift();
        const offset = before[before.length -1].length;
        throw new Error([
          `Syntax error in line ${lines_before.length} in migration file ${path.basename(file.filepath)}`,
          ...before.map((l, index)=>`\t${l}${index == before.length-1?after: ""}`),
          `\t`+((offset < e.message.length+1)?`${"^".padStart(offset," ")} ${e.message}`: `${e.message.padStart(offset - e.message.length)}^`),
        ].join("\n"));
      }
      await db.query(`
        INSERT 
        INTO migrations 
          (id, name, up, down)
        VALUES
          ($1, $2, $3, $4)
        `, [file.id, file.name, m.up, m.down]);
    }
    await db.query("COMMIT TRANSACTION");
  }catch(e:any){
    await db.query("ROLLBACK TRANSACTION");
    if(e.detail && debug.enabled) debug(`Erreur de migration : ${e.message}\n\t${e.detail}${e.hint?"\n\t"+e.hint:""}`);
    throw e;
  }
}
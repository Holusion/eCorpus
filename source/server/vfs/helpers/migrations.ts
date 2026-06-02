import path from 'node:path';
import { readFile, readdir } from "node:fs/promises";
import { debuglog } from "node:util";

import { ClientBase } from "pg";

import errors, { expandSQLError } from "./errors.js";
import { DatabaseHandle } from './db.js';

const debug = debuglog("pg:migration");

export interface MigrationParams{
  db: ClientBase,
  migrations: string,
  force: boolean,
}

export interface MigrationFile{
  id: number;
  name: string;
  filepath: string;
}

interface MigrationRecord{
  id:number;
  name:string;
  down:string;
}


function *_streamMapMigrations(files :string[]){
  for(let filepath of files){
    const basename = path.basename(filepath);
    const m = basename.match(/^(\d+).(.*?)\.sql$/);
    if(!m) continue;
    yield { id: Number(m[1]), name: m[2], filepath}
  }
}

export function mapMigrations(files :string[]){
  return Array.from(_streamMapMigrations(files)).sort((a, b) => Math.sign(a.id - b.id))
}

/**
 * Makes a sorted list of migrations found in a directory
 * @param dir 
 * @returns 
 */
export async function listMigrations(dir:string):Promise<{id:number, name:string, filepath:string}[]>{
  let files = await readdir(dir);
  let migrations = mapMigrations( files.map(f=>path.join(dir,f)) );
  if(migrations.length == 0) throw new Error(`No migration files found in ${dir}`);
  return migrations;
}

export function parseMigrationString(content :string){
  const [up, down, ...rest] = content.split(/^--+\s*?down\b/im)
  if(rest.length) throw new Error(`"down" migration delimiter matched multiple times`);
  return {
    up: up.trim(),
    down: down ? down.trim() : '',
  }
}

export async function parseMigrationFile(file:string){
  const content = await readFile(file, {encoding: "utf-8"});
  return parseMigrationString(content);
}

async function undoMigration(db:ClientBase, record :MigrationRecord){
  debug(`Undo migration ${record.id.toString(10).padStart(3, "0")}-${record.name} (file not found)`);
  await db.query("BEGIN TRANSACTION");
  try{
    await db.query("SET CONSTRAINTS ALL DEFERRED");
    await db.query(record.down);
    await db.query(`DELETE FROM migrations WHERE id = $1`, [record.id]);
  }catch(e){
    throw expandSQLError(e, record.down, `migration record ${record.id.toString().padStart(3, "0")}-${record.name}`);
  }finally{
    await db.query("END TRANSACTION");
  }
}

function fmtMigration(m:{id:number, name:string}){
  return `${m.id.toString(10).padStart(3, "0")}-${m.name}`;
}

export interface MigrationReport{
  database?: string;
  /** Migrations found on disk and already applied to the database (skipped this run) */
  skipped: Array<{id:number, name:string}>;
  /** Migrations rolled back during this run (missing file or force flag) */
  undone: Array<{id:number, name:string}>;
  /** Migrations successfully applied during this run, in order */
  applied: Array<{id:number, name:string}>;
  /** Migration that was being processed when the error occurred, if any */
  current?: {id:number, name:string, filepath:string};
}

function formatReport(report:MigrationReport, err:Error):string{
  const lines = [
    `Database migration failed: ${err.message}`,
    `\ttarget database: ${report.database ?? "<unknown>"}`,
    `\tfailed on: ${report.current ? `${fmtMigration(report.current)} (${report.current.filepath})` : "<none>"}`,
    `\tskipped (already applied): ${report.skipped.length? report.skipped.map(fmtMigration).join(", "): "<none>"}`,
    `\tundone in this run: ${report.undone.length? report.undone.map(fmtMigration).join(", "): "<none>"}`,
    `\tapplied in this run: ${report.applied.length? report.applied.map(fmtMigration).join(", "): "<none>"}`,
  ];
  return lines.join("\n");
}

export async function migrate({db, migrations: dir, force}: MigrationParams){
  const files = await listMigrations(dir);
  const report :MigrationReport = {
    skipped: [],
    undone: [],
    applied: [],
  };
  try{
    const r = await db.query<{current_database:string}>(`SELECT current_database()`);
    report.database = r.rows[0]?.current_database;
  }catch(e){
    debug(`Failed to resolve current database name: `, e);
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS "migrations" (
    id   INTEGER PRIMARY KEY,
    name TEXT    NOT NULL,
    up   TEXT    NOT NULL,
    down TEXT    NOT NULL
  );`);

  let records:{id:number, name:string, down:string}[] = (await db.query(`SELECT id, name, down FROM "migrations" ORDER BY id ASC`)).rows;
  await db.query("BEGIN TRANSACTION");
  try{
    //Undo any migration that has no file
    for(const record of records.slice().reverse()){
      if(files.find(m=>m.id === record.id)) continue;
      report.current = {id: record.id, name: record.name, filepath: "<missing file>"};
      await undoMigration(db, record);
      report.undone.push({id: record.id, name: record.name});
      records = records.filter(r=>r.id!== record.id);
      report.current = undefined;
    }

    if(force && records.length){
      console.log("Force Migration")
      const lastMigration = records[records.length - 1];
      if(lastMigration){
        report.current = {id: lastMigration.id, name: lastMigration.name, filepath: "<force re-apply>"};
        await undoMigration(db, lastMigration);
        report.undone.push({id: lastMigration.id, name: lastMigration.name});
        records = records.slice(0, -1);
        report.current = undefined;
      }
    }

    const lastMigrationId = records.length? records[records.length -1].id :0;
    for(let file of files){
      if(file.id <= lastMigrationId){
        report.skipped.push({id: file.id, name: file.name});
        continue;
      }
      report.current = file;
      const m = await parseMigrationFile(file.filepath);
      debug(`Apply migration ${path.basename(file.filepath)}`);
      await db.query("BEGIN TRANSACTION");
      try{
          await db.query("SET CONSTRAINTS ALL DEFERRED");
          await db.query(m.up);
          await db.query(`
            INSERT
            INTO migrations
              (id, name, up, down)
            VALUES
              ($1, $2, $3, $4)
            `, [file.id, file.name, m.up, m.down]);
      }catch(e:any){
        throw expandSQLError(e, m.up, `file ${path.basename(file.filepath)}`);
      }finally{
          await db.query("END TRANSACTION");
      }
      report.applied.push({id: file.id, name: file.name});
      report.current = undefined;
    }
    await db.query("COMMIT TRANSACTION");
  }catch(e:any){
    try{
      await db.query("ROLLBACK TRANSACTION");
      /* c8 ignore start */
    }catch(e){
      console.warn("Failed to rollback migration transaction :", e);
    }
    console.error(formatReport(report, e));
    if(e.detail && debug.enabled) debug(`Databse migration error: ${e.message}\n\t${e.detail}${e.hint?"\n\t"+e.hint:""}`);
    /* c8 ignore stop */
    throw e;
  }
}
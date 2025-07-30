import { constants, promises as fs } from "fs";
import { createHash } from "crypto";
import path from "path";
import { NotFoundError, ConflictError, BadRequestError, InternalError } from "../utils/errors.js";
import uid, { Uid } from "../utils/uid.js";
import BaseVfs from "./Base.js";
import { DataStream, DocProps, FileProps, GetFileParams, GetFileRangeParams, GetFileResult, WriteDirParams, WriteDocParams, WriteFileParams } from "./types.js";

import { Transaction } from "./helpers/db.js";
import { FileHandle } from "fs/promises";
import { Duplex, Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import { transform } from "typescript";

interface DiskFileParams{
  size :number;
  hash :string|null;
  mime ?:string;
}

interface DocFileParams extends DiskFileParams{
  data : string|Buffer|null;
}

interface CreateFileCallbackParams{
  id :number;
  /**
   * the database transaction used in this operation
   */
  tr :Transaction;
}

interface ListFilesOptions{
  withArchives ?:boolean;
  withFolders ?:boolean;
  withData ?:boolean;
}

export default abstract class FilesVfs extends BaseVfs{

  /**
   * Write a stream to a temporary file then atomically rename it to the destination.
   * Prevents data corruption due to I/O caching at the system level
   * Wraps createFile to provide safe file creation with on-failure cleanup and atomic rename
   */
  async writeFile(
    dataStream :DataStream, 
    params :WriteFileParams
  ) :Promise<FileProps>{
    let file_name = (new Date()).toISOString()+"_"+uid(6);
    let tmpfile = path.join(this.uploadsDir, file_name);
    let handle = await fs.open(tmpfile, constants.O_RDWR|constants.O_CREAT|constants.O_EXCL);
    let hashsum = createHash("sha256");
    let size = 0;
    try{
      let ws = handle.createWriteStream();
      await pipeline(
        dataStream,
        new Transform({
          transform(chunk, encoding, callback){
            hashsum.update(chunk);
            size += chunk.length;
            callback(null, chunk);
          }
        }),
        ws,
      );
      let hash = hashsum.digest("base64url");
      let destfile = path.join(this.objectsDir, hash);

      return await this.createFile(params, async ({id})=>{
        try{
          // It's always possible for the transaction to fail afterwards, creating a loose object
          // However it's not possible to safely clean it up without race conditions over any other row that may be referencing it
          await fs.link(tmpfile, destfile);
        }catch(e){
          if((e as any).code != "EEXIST") throw e;
          //If a file with the same hash exists, we presume it's the same file and don't overwrite it.
        }
        return {hash, size};
      });
    }finally{
      await handle.close();
      await fs.unlink(tmpfile).catch(e=>console.error("Error while trying to remove tmpfile : ", e));
    }
  }


  /**
   * Write a document for a scene
   * Unlike regular files, documents are stored as a string in the database
   * @returns the created document id
   */
  async writeDoc(data:string|Buffer|null, props :WriteFileParams) :Promise<FileProps>{
    if(data == null) return await this.createFile(props, {hash:null, data: null, size: 0});
    let b = Buffer.isBuffer(data)? data: Buffer.from(data);
    let text = typeof data === "string"? data: b.toString("utf-8");
    let hashsum = createHash("sha256");
    hashsum.update(b);
    let hash = hashsum.digest("base64url");
    let size = b.length;
    return await this.createFile(props, {data: text, size, hash});
  }

  /**
   * create an entry for a file. It is expected to already exist or be created in the callback
   * @see writeFile for a wrapper that handles file creation and is easier to use properly
   * @see writeDoc to create a file with embedded data
   */
  async createFile(params :WriteFileParams,  theFile :DocFileParams) :Promise<FileProps>
  async createFile(params :WriteFileParams, theFile :DiskFileParams) :Promise<FileProps>
  async createFile(params :WriteFileParams, theFile :((params:CreateFileCallbackParams)=>Promise<DiskFileParams>)) :Promise<FileProps>
  async createFile(params :WriteFileParams|WriteDocParams, theFile :DocFileParams|DiskFileParams|((params:CreateFileCallbackParams)=>Promise<DiskFileParams>)) :Promise<FileProps>{

    let fileParams :DiskFileParams  = Object.assign({
      size: 0,
      hash: null,
    }, ((typeof theFile === "function")? {} : theFile));
    let data = ((typeof theFile === "object" && "data" in theFile && theFile.data)? theFile.data : null);

    return await this.db.beginTransaction<FileProps>(async tr =>{
      let r = await tr.get<{id:number, generation: number, ctime: Date}>(`
        WITH 
          cte_scene AS MATERIALIZED (
            SELECT scene_id
            FROM scenes
            WHERE ${typeof params.scene =="number"? "scene_id":"scene_name"} = $1
          ),
          cte_current_file AS (
            SELECT generation, fk_scene_id AS scene_id
            FROM cte_scene
            INNER JOIN current_generations ON fk_scene_id = cte_scene.scene_id
            WHERE name = $2
            FOR UPDATE
          )
        INSERT INTO files (name, mime, data, hash, size, generation, fk_scene_id, fk_author_id)
        SELECT 
          $2 AS name,
          $3 AS mime,
          $4 AS data,
          $5 AS hash,
          $6 AS size,
          COALESCE(  generation
          , 0) + 1 AS generation,
          cte_scene.scene_id AS fk_scene_id,
          $7 AS fk_author_id
        FROM cte_scene
        LEFT JOIN cte_current_file USING(scene_id)
        RETURNING 
          file_id as id,
          generation,
          ctime
      `, [
        params.scene,
        params.name,
        params.mime || "application/octet-stream" ,
        data,
        fileParams.hash,
        fileParams.size,
        params.user_id || null,
      ]);
      if(!r) throw new NotFoundError(`Can't find a scene ${typeof params.scene === "number"?"with id": "named"} ${params.scene}`);

      let {id: newfile_id, generation, ctime} = r;
      
      if(typeof theFile === "function"){
        fileParams = await theFile({id: newfile_id, tr});
        if(fileParams?.hash || fileParams?.size){
          let setHash = await tr.run(`UPDATE files SET hash = $1, size = $2 WHERE file_id = $3`, [fileParams.hash, fileParams.size, newfile_id]);
          if(setHash.changes != 1) throw new InternalError(`Failed to update file hash`);
        }
      }

      let author = await tr.get(`SELECT username FROM users WHERE user_id = $1`,[params.user_id]);
      return {
        generation,
        id: newfile_id,
        ctime,
        mtime: ctime,
        size : fileParams.size,
        hash: fileParams.hash,
        mime: params.mime ?? "application/octet-stream",
        name: params.name,
        author_id: params.user_id,
        author: author?.username ?? "default",
      };
    });
  }

  async getFileById(id :number) :Promise<FileProps&{scene_id:number}>{
    let r = await this.db.get<{
      id: number,
      name: string,
      mime: string,
      size: number,
      data?: string,
      hash: string|null,
      generation: number,
      ctime: Date,
      mtime: Date,
      author_id: number,
      author: string,
      scene_id: number,
    }>(`
      SELECT
        file_id AS id,
        files.name AS name,
        mime,
        size,
        data,
        hash,
        generation,
        first.ctime AS ctime,
        files.ctime AS mtime,
        files.fk_author_id AS author_id,
        COALESCE(username, 'default') AS author,
        fk_scene_id AS scene_id
      FROM files 
        LEFT JOIN (SELECT MIN(ctime) AS ctime, fk_scene_id, name FROM files GROUP BY fk_scene_id, name ) AS first
          USING(fk_scene_id, name)
        LEFT JOIN users ON files.fk_author_id = user_id
      WHERE file_id = $1
    `, [ id ]);
    if(!r || !r.ctime) throw new NotFoundError(`No file found with id : ${id}`);
    return r;
  }
  /**
   * Fetch a file's properties from database
   * This function is growing out of control, having to manage disk vs doc stored files, mtime aggregation, etc...
   * The whole thing might become a performance bottleneck one day.
   */
  async getFileProps({scene, name, archive, generation, lock} :GetFileParams, withData?:false) :Promise<Omit<FileProps, "data">>
  async getFileProps({scene, name, archive, generation, lock} :GetFileParams, withData :true) :Promise<FileProps>
  async getFileProps({scene, name, archive = false, generation, lock} :GetFileParams, withData = false) :Promise<FileProps>{
    let is_string = typeof scene === "string";
    let with_generation = typeof generation !== "undefined";
    let args:any[] = [scene, name];
    if(with_generation){
      args.push(generation);
    }
    let r = await this.db.get(`
      WITH scene AS (SELECT scene_id FROM scenes WHERE ${(is_string?"scene_name":"scene_id")} = $1 )
      SELECT
        file_id AS id,
        files.name AS name,
        size,
        hash,
        ${withData? "data,":""}
        generation,
        (SELECT ctime FROM files WHERE (fk_scene_id = scene.scene_id AND name = $2 AND generation = 1)) AS ctime,
        files.ctime AS mtime,
        mime,
        files.fk_author_id AS author_id,
        COALESCE((SELECT username FROM users WHERE files.fk_author_id = user_id LIMIT 1), 'default') AS author
      FROM scene  
      LEFT JOIN files ON files.fk_scene_id = scene.scene_id 
      WHERE files.name = $2
      ${with_generation? `
        AND generation = $3
      ` : `
        ORDER BY generation DESC
        LIMIT 1`}
      ${lock?"FOR UPDATE":""}
    `, args);
    if(!r || !r.ctime || (!r.hash && !archive)) throw new NotFoundError(`${path.join(scene.toString(), name)}${archive?" incl. archives":""}`);
    return r;
  }

  /** Get a file's properties and a stream to its data
   * Simple shorthand to `getFileProps`with `fs.open`
   * Will throw an error if trying to open a deleted file or a directory
   * /!\ don't forget to close the stream /!\
   * @see getFileProps
   */
  async getFile(props:GetFileRangeParams): Promise<GetFileResult>{
    let r = await this.getFileProps(props, true);
    if(!r.hash && !r.data) throw new NotFoundError(`Trying to open deleted file : ${ r.name }`);
    if(r.hash === "directory") return r;

    let handle :Readable;
    if(typeof r.data === "string"){
      handle = Readable.from([Buffer.from(r.data).subarray(props.start, props.end)]);
    }else{
      let end =  ((typeof props.end  === "number" )? props.end - 1 : undefined);
      let start = props.start;
      if(typeof start === "number" && start < 0){
        start += r.size;
      }
      handle = (await this.openFile({hash: r.hash!})).createReadStream({
        start,
        end: end,
      });
    }
    return {
      ...r,
      stream: handle,
    };
  }

  /**
   * Shorthand to get latest doc of a scene. Ensure data is properly stored
   */
  async getDoc(scene :string|number, lock=false) :Promise<DocProps>{
    let r = await this.getFileProps({scene, name: "scene.svx.json", lock}, true);
    if(!r.data)  throw new BadRequestError(`Not a valid document: ${ r.name }`);
    if(Buffer.isBuffer(r.data)) r.data = r.data.toString("utf8");
    
    return r as DocProps;
  }

  /**
   * Low-level filesystem call to get a FsHandle to a file
   * Isolated here so it can easily be replaced to any blob storage external service if needed
   */
  async openFile(file:{hash :string}) :Promise<FileHandle>{
    return await fs.open(this.getPath(file), constants.O_RDONLY);
  }

  /**
   * Gets the path to a filesystem-stored file
   */
  public getPath(file:{hash:string}) :string{
    return path.join(this.objectsDir, file.hash)
  }

  public exists(file :Partial<FileProps>) :file is {hash :string}{
    return typeof file.hash === "string" && file.data == null;
  }

  /**
   * Get an history of versions for a file
   * It is ordered as last-in-first-out
   * for each entry, ctime == mtime always because files are immutable
   */
  async getFileHistory({scene, name} :GetFileParams):Promise<FileProps[]>{
    let is_string = typeof scene === "string";
    let rows = await this.db.all<Omit<FileProps, "mtime">>(`
      WITH scene AS (SELECT scene_id FROM scenes WHERE ${(is_string?`scene_name`:"scene_id")} = $1)
      SELECT
        file_id as id,
        size,
        hash,
        generation,
        ctime,
        files.name AS name,
        mime,
        fk_author_id AS author_id,
        COALESCE(users.username, 'default') AS author
      FROM scene
        INNER JOIN files ON (fk_scene_id = scene.scene_id AND files.name = $2)
        LEFT JOIN users ON fk_author_id = user_id
      ORDER BY generation DESC
    `, [ scene,  name ]);
    if(!rows || !rows.length) throw new NotFoundError();
    return rows.map(r=>({...r, mtime: new Date(r.ctime.valueOf())}));
  }
  /**
   * a shortHand to createFile(params, {hash: null, size: 0}) that also verifies if the file actually exists
   */
  async removeFile(params :WriteFileParams) :Promise<number>{
    return await this.isolate<number>(async function(tr){
      //Check if file does exist
      let prev = await tr.getFileProps({...params, archive: true});
      if(!prev.hash){
        throw new ConflictError(`File ${path.join(params.scene.toString(), params.name)} is already deleted`);
      }
      let f = await tr.createFile(params, {hash: null, size: 0});
      return f.id;

    })
  }
  
  async renameFile(props :WriteFileParams, nextName :string) :Promise<number>{
    return await this.isolate<number>(async tr=>{
      let scene_id :number = ((typeof props.scene === "string")?
        await tr.db.get<{scene_id:number}>(`SELECT scene_id FROM scenes WHERE scene_name = $1`, [ props.scene ])
          .then(r=>{
            if(!r) throw new NotFoundError(`No scene with id ${props.scene}`);
            return r.scene_id;
          })
        : props.scene
      );
      //Get current file
      let thisFile = await tr.getFileProps(props, true);
      //Get dest file
      let destFile = await tr.getFileProps({...props, name: nextName, archive: true})
      .catch(e=>{
        if(e.code == 404) return  {generation:0, hash:null};
        throw e;
      });
      if(destFile.hash){
        throw new ConflictError(`A file named ${nextName} already exists in scene ${scene_id}`);
      }

      await tr.createFile(props, {hash: null, size: 0});
      let f = await tr.createFile({ ...props, mime:thisFile.mime, name: nextName}, thisFile);

      if(!f?.id)  throw new NotFoundError(`can't create renamed file`);
      return f.id;
    });
  }
  /**
   * Get a list of all files in a scenes in their current state.
   * @see getSceneHistory for a list of all versions
   * Ordering should be consistent with `getSceneHistory`
   * @fixme check for performance benefits of using the new current_files view? 
   */
  listFiles(scene_id :number) :AsyncGenerator<(FileProps & {hash: string}), void, undefined>
  listFiles(scene_id :number, opts :{withArchives:false, withFolders: false}& ListFilesOptions) :AsyncGenerator<(FileProps & {hash: string}), void, undefined>
  listFiles(scene_id :number, opts :ListFilesOptions) :AsyncGenerator<FileProps, void, undefined>
  async *listFiles(scene_id :number, {withArchives = false, withFolders = false, withData = false}: ListFilesOptions ={}) :AsyncGenerator<FileProps, void, undefined>{
    yield* this.db.each<FileProps>(`
      WITH ag AS ( 
        SELECT fk_scene_id, name, MAX(ctime) as mtime, MIN(ctime) as ctime , MAX(generation) AS generation
        FROM files
        WHERE fk_scene_id = $1
        GROUP BY fk_scene_id, name
      )
      SELECT 
        ag.mtime AS mtime,
        ag.ctime AS ctime,
        files.size AS size,
        hash,
        ${withData? "data,":""}
        ag.generation as generation,
        file_id as id,
        files.name AS name,
        mime,
        fk_author_id AS author_id,
        COALESCE(username, 'default') AS author
      FROM ag
        INNER JOIN files 
          USING(fk_scene_id, name, generation)
        LEFT JOIN users
          ON files.fk_author_id = user_id
      WHERE TRUE
        ${((withArchives)?"":`AND hash IS NOT NULL`)}
        ${((withFolders)? "": `AND mime != 'text/directory'`)}
      ORDER BY mtime DESC, name ASC
    `, [ scene_id ]);
  }

  async createFolder({scene, name, user_id} :WriteDirParams){
    if(name.startsWith("/")) throw new BadRequestError("Folders must be relative to the scene root");
    if(name.endsWith("/")) throw new BadRequestError("Folder names must not end with a slash");
    return await this.isolate(async tr =>{
      try{
        await tr.getFileProps({scene, name});
        throw new ConflictError(`Folder ${name} already exists in scene ${ scene}`);
      }catch(e){
        if((e as any).code != 404) throw e;
      }
      return await tr.createFile({
        scene, 
        name, 
        mime: "text/directory",
        user_id,
      }, {hash: "directory", size: 0});
    });
  }

  async *listFolders(scene :number){
    for await (let f of this.listFiles(scene, {withArchives: false, withFolders: true})){
      if(f.mime !== "text/directory") continue; 
      yield f;
    }
  }

  async removeFolder({scene, name, user_id}:WriteDirParams){
    return await this.removeFile({scene, name, user_id, mime: "text/directory"});
  }
}
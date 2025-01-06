import { constants, promises as fs } from "fs";
import { createHash } from "crypto";
import path from "path";
import { NotFoundError, ConflictError, BadRequestError, InternalError } from "../utils/errors.js";
import { Uid } from "../utils/uid.js";
import BaseVfs from "./Base.js";
import { DataStream, DocProps, FileProps, GetFileParams, GetFileResult, Stored, WriteDirParams, WriteDocParams, WriteFileParams } from "./types.js";

import { Transaction } from "./helpers/db.js";
import { FileHandle } from "fs/promises";
import { Duplex, Readable, Transform } from "stream";

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

    return this.createFile(params, async ({id})=>{
      let file_name = Uid.toString(id)
      let tmpfile = path.join(this.uploadsDir, file_name);
      let handle = await fs.open(tmpfile, constants.O_RDWR|constants.O_CREAT|constants.O_EXCL);
      let hashsum = createHash("sha256");
      let size = 0;
      try{
        for await (let d of dataStream){
          let {bytesWritten} = await handle.write(d);
          size += bytesWritten;
          hashsum.update(d);
        }
        //hash.digest("base64url")
        let hash = hashsum.digest("base64url");
        let destfile = path.join(this.objectsDir, hash);
        try{
          // It's always possible for the transaction to fail afterwards, creating a loose object
          // However it's not possible to safely clean it up without race conditions over any other row that may be referencing it
          await fs.link(tmpfile, destfile);
        }catch(e){
          if((e as any).code != "EEXIST") throw e;
          //If a file with the same hash exists, we presume it's the same file and don't overwrite it.
        }
        await fs.unlink(tmpfile);
        return {hash, size};
      }catch(e){
         //istanbul ignore next
         await fs.rm(tmpfile, {force: true}).catch(e=>console.error("Error while trying to remove tmpfile : ", e));
         //istanbul ignore next
         throw e; //Transaction will rollback
      }finally{
        await handle.close();
      }
    });
    
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
      let r = await tr.get<{id:number, generation: number, ctime: string}>(`
        WITH scene AS (SELECT scene_id FROM scenes WHERE ${typeof params.scene =="number"? "scene_id":"scene_name"} = $scene )
        INSERT INTO files (name, mime, data, hash, size, generation, fk_scene_id, fk_author_id)
        SELECT 
          $name AS name,
          $mime AS mime,
          $data AS data,
          $hash AS hash,
          $size AS size,
          IFNULL((
            SELECT MAX(generation) FROM files WHERE fk_scene_id = scene_id AND name = $name
          ), 0) + 1 AS generation,
          scene_id AS fk_scene_id,
          $user_id AS fk_author_id
        FROM scene
        RETURNING 
          file_id as id,
          generation, 
          ctime
      `, {

        $scene: params.scene,
        $name: params.name,
        $mime: params.mime || "application/octet-stream" ,
        $user_id: params.user_id,
        $data: data,
        $hash: fileParams.hash,
        $size: fileParams.size,
      });
      if(!r) throw new NotFoundError(`Can't find a scene named ${params.scene}`);

      let {id, generation, ctime} = r;
      
      if(typeof theFile === "function"){
        fileParams = await theFile({id, tr});
        if(fileParams?.hash || fileParams?.size){
          let setHash = await tr.run(`UPDATE files SET hash = $hash, size = $size WHERE file_id = $id`, {$hash: fileParams.hash, $size: fileParams.size, $id: id});
          if(setHash.changes != 1) throw new InternalError(`Failed to update file hash`);
        }
      }

      let author = await tr.get(`SELECT username FROM users WHERE user_id = $user_id`,{$user_id: params.user_id});
      return {
        generation,
        id: id,
        ctime: BaseVfs.toDate(ctime),
        mtime: BaseVfs.toDate(ctime),
        size : fileParams.size,
        hash: fileParams.hash,
        mime: params.mime ?? "application/octet-stream",
        name: params.name,
        author_id: params.user_id,
        author: author.username,
      };
    });
  }

  async getFileById(id :number) :Promise<FileProps>{
    let r = await this.db.get<{
      id: number,
      name: string,
      mime: string,
      size: number,
      data?: string,
      hash: string|null,
      generation: number,
      ctime: string,
      mtime: string,
      author_id: number,
      author: string,
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
        username AS author
      FROM files 
        INNER JOIN (SELECT MIN(ctime) AS ctime, fk_scene_id, name FROM files GROUP BY fk_scene_id, name ) AS first
          ON files.fk_scene_id = first.fk_scene_id AND files.name = first.name
        INNER JOIN users ON files.fk_author_id = user_id
      WHERE id = $id
    `, {$id: id});
    if(!r || !r.ctime) throw new NotFoundError(`No file found with id : ${id}`);
    return {
      ...r,
      ctime: BaseVfs.toDate(r.ctime), //z specifies the string as UTC != localtime
      mtime: BaseVfs.toDate(r.mtime),
    };
  }
  /**
   * Fetch a file's properties from database
   * This function is growing out of control, having to manage disk vs doc stored files, mtime aggregation, etc...
   * The whole thing might become a performance bottleneck one day.
   */
  async getFileProps({scene, name, archive, generation} :GetFileParams, withData?:false) :Promise<Omit<FileProps, "data">>
  async getFileProps({scene, name, archive, generation} :GetFileParams, withData :true) :Promise<FileProps>
  async getFileProps({scene, name, archive = false, generation} :GetFileParams, withData = false) :Promise<FileProps>{
    let is_string = typeof scene === "string";
    let r = await this.db.get(`
      WITH scene AS (SELECT scene_id FROM scenes WHERE ${(is_string?"scene_name":"scene_id")} = $scene )
      SELECT
        file_id AS id,
        files.name AS name,
        size,
        hash,
        ${withData? "data,":""}
        generation,
        (SELECT ctime FROM files WHERE fk_scene_id = scene.scene_id AND name = $name AND generation = 1) AS ctime,
        files.ctime AS mtime,
        mime,
        files.fk_author_id AS author_id,
        (SELECT username FROM users WHERE files.fk_author_id = user_id LIMIT 1) AS author
      FROM scene  
      LEFT JOIN files ON files.fk_scene_id = scene.scene_id 
      WHERE files.name = $name
      ${(typeof generation!== "undefined")? `
        AND generation = $generation
      ` : `
        ORDER BY generation DESC
        LIMIT 1`}
    `, {
      $scene: scene,
      $name: name,
      $generation: generation
    });
    if(!r || !r.ctime || (!r.hash && !archive)) throw new NotFoundError(`${path.join(scene.toString(), name)}${archive?" incl. archives":""}`);
    return {
      ...r,
      ctime: BaseVfs.toDate(r.ctime), //z specifies the string as UTC != localtime
      mtime: BaseVfs.toDate(r.mtime),
    };
  }

  /** Get a file's properties and a stream to its data
   * Simple shorthand to `getFileProps`with `fs.open`
   * Will throw an error if trying to open a deleted file or a directory
   * /!\ don't forget to close the stream /!\
   * @see getFileProps
   */
  async getFile(props:GetFileParams) :Promise<GetFileResult>{
    let r = await this.getFileProps(props, true);
    if(!r.hash && !r.data) throw new NotFoundError(`Trying to open deleted file : ${ r.name }`);
    if(r.hash === "directory") return r;

    let handle = (typeof r.data === "string")? Readable.from([Buffer.from(r.data)]): (await this.openFile({hash: r.hash!})).createReadStream();
    return {
      ...r,
      stream: handle,
    };
  }

  /**
   * Shorthand to get latest doc of a scene. Ensure data is properly stored
   */
  async getDoc(scene :string|number) :Promise<DocProps>{
    let r = await this.getFileProps({scene, name: "scene.svx.json"}, true);
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
  async getFileHistory({scene, name} :GetFileParams):Promise<GetFileResult[]>{
    let is_string = typeof scene === "string";
    let rows = await this.db.all<Stored<GetFileResult>[]>(`
      ${(is_string?`WITH scene AS (SELECT scene_id FROM scenes WHERE scene_name = $scene)`:"")}
      SELECT
        file_id as id,
        size,
        hash,
        generation,
        ctime,
        files.name AS name,
        mime,
        fk_author_id AS author_id,
        username AS author
      FROM files 
        INNER JOIN users ON fk_author_id = user_id
      ${(is_string? ` INNER JOIN scene ON fk_scene_id = scene_id WHERE name = $name`
        :"WHERE fk_scene_id = $scene AND name = $name"
        )}
      ORDER BY generation DESC
    `, {$scene: scene, $name: name});
    if(!rows || !rows.length) throw new NotFoundError();
    return rows.map( r=>({
      ...r,
      mtime: BaseVfs.toDate(r.ctime), //z specifies the string as UTC != localtime
      ctime: BaseVfs.toDate(r.ctime), //z specifies the string as UTC != localtime
    }));
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
        await tr.db.get<{scene_id:number}>(`SELECT scene_id FROM scenes WHERE scene_name = $name`, {$name : props.scene})
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
    let channel = new Transform({
      objectMode: true,
      transform({ctime, mtime, ...row}, encoding, callback) {
        callback(null, {
          ctime: BaseVfs.toDate(ctime),
          mtime: BaseVfs.toDate(mtime),
          ...row,
        });
      },
    });

    this.db.each<Stored<FileProps>>(`
      WITH ag AS ( 
        SELECT fk_scene_id, name, MAX(ctime) as mtime, MIN(ctime) as ctime , MAX(generation) AS generation
        FROM files
        WHERE fk_scene_id = $scene_id
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
        username AS author
      FROM ag
        INNER JOIN files 
          USING(fk_scene_id, name, generation)
        INNER JOIN users 
          ON files.fk_author_id = user_id
      WHERE 1
        ${((withArchives)?"":`AND hash IS NOT NULL`)}
        ${((withFolders)? "": `AND mime IS NOT 'text/directory'`)}
      ORDER BY mtime DESC, name ASC
    `, {$scene_id: scene_id}, (err, row)=>{
      if(err) return channel.emit("error", err);
      channel.write(row);
    }).then(()=> channel.end(), (e)=>channel.destroy(e));

    yield* channel;
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
import {escapeLiteral} from "pg";
import { AccessMap, AccessType, AccessTypes, fromAccessLevel, toAccessLevel } from "../auth/UserManager.js";
import config from "../utils/config.js";
import { BadRequestError, ConflictError,  NotFoundError } from "../utils/errors.js";
import { Uid } from "../utils/uid.js";
import BaseVfs from "./Base.js";
import { HistoryEntry, ItemEntry, ItemProps, Scene, SceneQuery } from "./types.js";
import errors, { expandSQLError } from "./helpers/errors.js";
import { UserLevels } from "../auth/User.js";


export default abstract class ScenesVfs extends BaseVfs{

  async createScene(name :string):Promise<number>
  async createScene(name :string, author_id :number):Promise<number>
  async createScene(name :string, author_id ?:number) :Promise<number>{

    for(let i=0; i<3; i++){
      try{
        let uid = Uid.make();
        //Unlikely, but still: skip uid that would prevent scene archiving
        if(name.endsWith("#"+uid.toString(10))) continue;

        return await this.db.beginTransaction<number>(async (tr)=>{
          let r = await tr.get<{scene_id:string}>(`
            INSERT INTO scenes (scene_name, scene_id, public_access, default_access, fk_author_id) 
            VALUES ( $1, $2, $3, $4, $5 )
            RETURNING scene_id AS scene_id;
          `, [
            name, 
            uid,
            toAccessLevel((config.public?"read":"none")),
            toAccessLevel("read"),
            author_id,
          ]);
          if(author_id){
            await tr.run(`INSERT INTO users_acl (fk_user_id, fk_scene_id, access_level) VALUES ($2, CAST($1 AS BIGINT), 3)`, [r.scene_id, author_id]);
          }
          return parseInt(r.scene_id);
        });
        
      }catch(e:any){
        if(e.code == errors.unique_violation){
          if(e.constraint == "scenes_pkey"){
            continue;
          }else if(e.constraint == "scenes_scene_name_key"){
            throw new ConflictError(`A scene named ${name} already exists`);
          }else{
            throw e;
          }
        }else{
          throw e;
        }
      }
    }
    throw new ConflictError(`Unable to find a free id`);
  }
  /**
   * WARNING: should not be used in normal operations
   * It will irrecorevably delete all associated resources
   * @see archiveScene
   */
  async removeScene(scene:number|string){
    let r = await this.db.run(`DELETE FROM scenes WHERE ${typeof scene ==="number"? "scene_id": "scene_name"} = $1`, [scene]);
    if(!r?.changes) throw new NotFoundError(`No scene found matching : ${scene}`);
  }
  /**
   * Archive a scene. Simply flips the "archived" boolean
   * @see UserManager.grant for a more granular setup
   */
  async archiveScene(scene :number|string){
    let r = await this.db.run(`
      UPDATE scenes 
      SET 
        archived = CURRENT_TIMESTAMP,
        scene_name = scene_name || '#' || CAST(scene_id AS TEXT)
      WHERE 
        ${typeof scene ==="number"? "scene_id": "scene_name"} = $1
        ${typeof scene ==="number"? `AND position(('#' || CAST(scene_id AS TEXT) ) IN scene_name) = 0`:""}
        AND archived IS NULL
    `, [ scene.toString(10) ]);
    if(!r?.changes) throw new NotFoundError(`No scene found matching : ${scene}`);
  }


  async unarchiveScene(scene:number|string):Promise<void>
  async unarchiveScene(scene:number|string, name:string):Promise<void>
  async unarchiveScene(scene:number|string, name?:string):Promise<void>{
    const args = [scene];
    if(typeof name !== "undefined"){
      args.push(name);
    }
    let r = await this.db.run(`
      UPDATE scenes 
      SET 
        archived = NULL,
        scene_name = ${typeof name !== "undefined"?"$2":`SUBSTR( scene_name, 0, LENGTH(scene_name) - LENGTH(CAST(scene_id AS TEXT)) )`}
      WHERE 
        ${typeof scene ==="number"? "scene_id": "scene_name"} = $1
        AND archived IS NOT NULL
    `, args);
    if(!r?.changes) throw new NotFoundError(`No scene found matching : ${scene}`);
  }

  async renameScene(scene_id :number, nextName :string){
    let r = await this.db.run(`
      UPDATE scenes
      SET scene_name = $2
      WHERE scene_id = $1
    `, [scene_id, nextName ]);
    if(!r?.changes) throw new NotFoundError(`no scene found with id: ${scene_id}`);
  }


  static _fragIsThumbnail(field :string = "name"){
    return `(${field} = 'scene-image-thumb.jpg' OR ${field} = 'scene-image-thumb.png') AND size != 0`;
  }
  /**
   * Performs a type and limit check on a SceneQuery object and throws if anything is unacceptable
   * @param q 
   */
  static _validateSceneQuery(q :Readonly<SceneQuery|any>):SceneQuery{
    //Check various parameters compliance
    if (typeof q.access !== "undefined" && (typeof q.access !== "string" || ["read", "write", "admin", "none"].indexOf(q.access.toLowerCase()) === -1)){
      throw new BadRequestError(`Invalid access type requested : ${q.access}`);
    }
    if(typeof q.author !== "undefined" &&  typeof q.author != "string"){
      throw new BadRequestError(`Invalid author filter request: ${q.author}`);
    }

    if(typeof q.limit !== "undefined"){
      if(typeof q.limit !="number" || Number.isNaN(q.limit) || !Number.isInteger(q.limit)) throw new BadRequestError(`When provided, limit must be an integer`);
      if(q.limit <= 0) throw new BadRequestError(`When provided, limit must be >0`);
      if(100 < q.limit) throw new BadRequestError(`When provided, limit must be <= 100`);
    }
    if(typeof q.offset !== "undefined"){
      if(typeof q.offset !="number" || Number.isNaN(q.offset) || !Number.isInteger(q.offset)) throw new BadRequestError(`When provided, offset must be an integer`);
      if(q.offset < 0) throw new BadRequestError(`When provided, limit must be >= 0`);
    }
    
    if(typeof q.orderDirection !== "undefined" && (typeof q.orderDirection !== "string" || ["asc", "desc"].indexOf(q.orderDirection.toLowerCase()) === -1)){
      throw new BadRequestError(`Invalid orderDirection: ${q.orderDirection}`);
    }
    if(typeof q.orderBy !== "undefined" && (typeof q.orderBy !== "string" || ["ctime", "mtime", "name", "rank"].indexOf(q.orderBy.toLowerCase()) === -1)){
      throw new BadRequestError(`Invalid orderBy: ${q.orderBy}`);
    }
    if(typeof q.archived !== "undefined" && typeof q.archived != "boolean"){
      throw new BadRequestError(`Invalid archived query: ${typeof q.archived}`);
    }
    return q;
  }
  
  /**
   * get all scenes, including archvied scenes Generally not used outside of tests and internal routines
   */
  async getScenes():Promise<Scene[]>;
  /**
   * Get all scenes for <user_id>, filtering results with structured queries when called with filters
   */
  async getScenes(user_id :number|undefined, q?:SceneQuery):Promise<Scene[]>;
  /**
   * Get a filtered list of scenes but bypass user_id restrictions (when running as an administrator)
   */
  async getScenes(user_id:null, q :SceneQuery) :Promise<Scene[]>;
  async getScenes(user_id ?:number|null, q:SceneQuery = {}) :Promise<Scene[]>{
    
    const {access, author, match, limit = 10, offset = 0, orderBy = "name", orderDirection = "asc", archived}  = ScenesVfs._validateSceneQuery(q);
    let with_filter = typeof user_id === "number" || match || typeof author === "string" || access?.length  || typeof archived === "boolean";

    const args = author? 
    [
      (user_id? user_id.toString(10) : (access?.length? "0": undefined)),
      offset,
      limit,
      match,
      author
    ] : [
      (user_id? user_id.toString(10) : (access?.length? "0": undefined)),
      offset,
      limit,
      match
    ] ;
    const sortString = (orderBy == "name")? "LOWER(name)": orderBy;

    let result = (await this.db.all<{
      id:string,
      name:string,
      ctime: Date,
      mtime: Date,
      author_id: number,
      author: string,
      thumb: string|null,
      tags: string [],
      user_access: number,
      default_access: number,
      public_access: number,
      archived: Date|null,
    }>(
      `WITH 
        docs AS (
          SELECT ctime AS mtime, fk_scene_id
          FROM current_files
          WHERE mime = 'application/si-dpo-3d.document+json' AND data IS NOT NULL
        ),
        thumbnails AS (
          SELECT name, ctime, fk_scene_id
          FROM current_files
          WHERE ${ScenesVfs._fragIsThumbnail()}
        )
      SELECT *
      FROM ( 
        SELECT 
          scenes.scene_id AS id,
          scenes.scene_name AS name,
          scenes.ctime AS ctime,
          scenes.archived AS archived,
          MAX(COALESCE(docs.mtime, scenes.ctime)) as mtime,
          scenes.fk_author_id AS author_id,
          COALESCE(users.username, 'default') AS author,
          (SELECT name FROM thumbnails WHERE fk_scene_id = scene_id ORDER BY ctime DESC, name ASC LIMIT 1) AS thumb,
          COALESCE( array_agg(tags.tag_name) FILTER (WHERE tags.tag_name IS NOT NULL), '{}') AS tags,
          COALESCE( users_acl.access_level, scenes.default_access) AS user_access,
          scenes.default_access AS default_access,
          scenes.public_access AS public_access,
          MAX(ts_rank(ts_terms, websearch_to_tsquery(language::regconfig, $4))) AS rank
        
        FROM 
          scenes
          LEFT JOIN users_acl ON ( fk_user_id = $1 AND users_acl.fk_scene_id = scene_id)
          LEFT JOIN docs ON docs.fk_scene_id = scene_id
          LEFT JOIN users ON scenes.fk_author_id = user_id
          LEFT JOIN tags ON tags.fk_scene_id = scene_id
          LEFT JOIN scenes_search_terms ON (scenes_search_terms.fk_scene_id = scenes.scene_id)
          ${with_filter? "WHERE true": ""}
          ${typeof author === "string"? `AND users.username = $5`:"" }
          ${typeof user_id === "number"? `AND ( (SELECT level FROM users WHERE user_id=${user_id} ) = ${UserLevels.ADMIN}
            OR GREATEST(users_acl.access_level, scenes.default_access, scenes.public_access) >= ${toAccessLevel("read")}
            )`:"AND scenes.public_access > 0"}
          ${access? `AND
            GREATEST(users_acl.access_level, scenes.default_access, scenes.public_access) >= ${toAccessLevel(access)}
            `: ""}
          ${typeof archived === "boolean"? `AND archived ${archived?"IS NOT":"IS"} NULL`:""}
          
        GROUP BY id, scene_name, username, access_level
        )  as filtered_scenes
      ${match? `WHERE rank > 0.00001`:""}
      ORDER BY ${sortString} ${orderDirection.toUpperCase()}
      OFFSET $2
      LIMIT $3
      `
      
  , args));

    return result.map(({id, user_access, default_access, public_access, ...m})=>({
      ...m,
      id: parseInt(id),
      tags: m.tags,
      access: fromAccessLevel( Math.max(user_access, default_access, public_access)),
      public_access: fromAccessLevel(public_access),
      default_access: fromAccessLevel(default_access),
    }));
  
  }

  /**
   * Gets the scene, with access property truncated to show only user-visible data.
   * Use userManager.getPermissions to get the full access map.
   * 
   * `user_id` is not verified in this request. It should be validated beforehand to supply only valid user ids
   */
  async getScene(nameOrId :string|number, user_id?:number) :Promise<Scene>{
    let key = ((typeof nameOrId =="number")? "scene_id":"scene_name");
    let args = [nameOrId];
    if(typeof user_id != "undefined") args.push(user_id.toString(10));
    const scene_stored = await this.db.get<{
      name: string,
      id: number,
      ctime :Date,
      author_id: number,
      author: string,
      access: number,
      default_access: number,
      public_access: number,
      archived: Date|null,
    }>(`
      SELECT 
        scene_name as name,
        scene_id as id,
        ctime,
        archived,
        fk_author_id AS author_id,
        COALESCE(
          (SELECT username FROM users WHERE user_id = fk_author_id),
          'default'
        ) AS author,
        default_access,
        public_access,
        GREATEST(
          ${(typeof user_id != "undefined")?`(SELECT access_level FROM users_acl WHERE (fk_user_id = $${args.length} AND fk_scene_id = scenes.scene_id)),
          CASE WHEN EXISTS(SELECT * FROM users WHERE user_id = ${user_id}) THEN scenes.default_access ELSE 0 END,
          `: ``}
          public_access
        ) AS access 
      FROM scenes
      WHERE (${key} = $1
      ${(typeof user_id != "undefined")?`AND GREATEST ( (SELECT access_level FROM users_acl WHERE (fk_user_id = $${args.length} AND fk_scene_id = scenes.scene_id)),
          CASE WHEN EXISTS(SELECT * FROM users WHERE user_id = ${user_id}) THEN scenes.default_access ELSE 0 END,
          public_access) > 0
          `: ``}
    )
    `, args);

    if(!scene_stored) throw new NotFoundError(`No scene found with ${key}: ${nameOrId}`);

    const scene :Omit<Scene, "tags"|"mtime"> = {
      ...scene_stored,
      access: fromAccessLevel(scene_stored.access),
      public_access: fromAccessLevel(scene_stored.public_access),
      default_access: fromAccessLevel(scene_stored.default_access),
      };

    let tags = await this.db.all<{name:string}>(`
      SELECT 
        tag_name AS name
      FROM tags
      WHERE tags.fk_scene_id = $1
    `,[scene.id]);

    let r = await this.db.get<{mtime:Date, thumb?:string}>(`
      WITH scene_files AS (
        SELECT *
        FROM current_files
        WHERE fk_scene_id = $1
      )
      SELECT 
        (SELECT MAX(ctime) FROM scene_files) AS mtime,
        (SELECT name FROM scene_files WHERE ${ScenesVfs._fragIsThumbnail()} ORDER BY ctime DESC, name ASC LIMIT 1) AS thumb
    `, [scene.id]);

    return {
      ...scene,
      mtime: (r?.mtime ?? scene.ctime),
      archived: scene.archived,
      thumb: r?.thumb ?? null,
      tags: tags.map(t=>t.name),
    }
  }

  /**
   * Get every version of anything contained in this scene.
   * This could get quite large...
   * 
   * Return order is **DESCENDING** over ctime, name, generation (so, new files first).
   * Result is **NOT** access-dependant so it should only be returned for someone that has the required access level 
   * 
   * @see listFiles for a list of current files.
   */
  async getSceneHistory(scene_id :number, query:Pick<SceneQuery,"limit"|"offset"|"orderDirection"> ={}) :Promise<Array<HistoryEntry>>{
    const {limit = 10, offset = 0, orderDirection = "desc"} = ScenesVfs._validateSceneQuery(query);

    const dir = orderDirection.toUpperCase() as Uppercase<typeof orderDirection>;
    return await this.db.all<Omit<ItemEntry,"mtime">>(`
      SELECT 
        file_id AS id,
        name,
        mime,
        generation,
        ctime,
        username AS author,
        fk_author_id AS author_id,
        size
      FROM files
      LEFT JOIN users ON fk_author_id = user_id
      WHERE fk_scene_id = $1
      ORDER BY ctime ${dir}, name ${dir}, generation ${dir}
      OFFSET $2
      LIMIT $3
    `, [
      scene_id,
      offset,
      limit,
    ]);

  }

}
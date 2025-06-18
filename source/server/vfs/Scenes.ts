import {escapeLiteral} from "pg";
import { AccessMap, AccessType, AccessTypes } from "../auth/UserManager.js";
import config from "../utils/config.js";
import { BadRequestError, ConflictError,  NotFoundError } from "../utils/errors.js";
import { Uid } from "../utils/uid.js";
import BaseVfs from "./Base.js";
import { HistoryEntry, ItemEntry, ItemProps, Scene, SceneQuery, Stored } from "./types.js";
import errors from "./helpers/errors.js";


export default abstract class ScenesVfs extends BaseVfs{

  async createScene(name :string):Promise<number>
  async createScene(name :string, author_id :number):Promise<number>
  async createScene(name :string, permissions:AccessMap):Promise<number>
  async createScene(name :string, perms ?:AccessMap|number) :Promise<number>{
    let permissions :AccessMap = (typeof perms === "object")? perms : {};
    let author_id = 0;
    //Always provide permissions for default user
    permissions['0'] ??= (config.public?"read":"none");
    permissions['1'] ??= "read";
    //If an author_id is provided, it is an administrator
    if(typeof perms === "number" ){
      permissions[perms.toString(10)] = "admin";
      author_id = perms;
    }else if(typeof perms ==="object"){
      let adm = Object.keys(perms).map(k=>parseInt(k)).find(n=> Number.isInteger(n) && 1 < n);
      if(adm) author_id = adm;
    }

    for(let i=0; i<3; i++){
      try{
        let uid = Uid.make();
        //Unlikely, but still: skip uid that would prevent scene archiving
        if(name.endsWith("#"+uid.toString(10))) continue;

        let r = await this.db.get(`
          INSERT INTO scenes (scene_name, scene_id, access, fk_author_id) 
          VALUES (
            $1,
            $2,
            $3,
            $4
          )
          RETURNING scene_id AS scene_id;
        `, [
          name, 
          uid,
          JSON.stringify(permissions),
          author_id,
        ]);
        return r.scene_id;
      }catch(e:any){
        if(e.code == errors.unique_violation){
          if(e.constraint == "scenes_scene_id_key"){
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
        archived = unixepoch(),
        scene_name = scene_name || '#' || CAST(scene_id AS TEXT)
      WHERE 
        ${typeof scene ==="number"? "scene_id": "scene_name"} = $1
        ${typeof scene ==="number"? `AND INSTR(scene_name, '#' || scene_id) = 0`:""}
        AND archived = 0
    `, [ scene ]);
    if(!r?.changes) throw new NotFoundError(`No scene found matching : ${scene}`);
  }


  async unarchiveScene(scene:number|string):Promise<void>
  async unarchiveScene(scene:number|string, name:string):Promise<void>
  async unarchiveScene(scene:number|string, name?:string):Promise<void>{
    let r = await this.db.run(`
      UPDATE scenes 
      SET 
        archived = 0,
        scene_name = ${typeof name !== "undefined"?"$2":`SUBSTR( scene_name, 0, LENGTH(scene_name) -LENGTH(CAST(scene_id AS TEXT)) )`}
      WHERE 
        ${typeof scene ==="number"? "scene_id": "scene_name"} = $1
        AND archived IS NOT 0
    `, [ scene, name ]);
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

  /**
   * Reusable fragment to check if a user has the required access level for an operation on a scene.
   * Most permission checks are done outside of this module in route middlewares,
   * but we sometimes need to check for permissions to filter list results
   * 
   * This does NOT check for administrator access
   * 
   * @param user_id User_id, to detect "default" special case
   * @param accessMin Minimum expected acccess level, defaults to read
   * @returns 
   */
  static _fragUserCanAccessScene(user_id :number, accessMin:AccessType = "read"){
    return `
      COALESCE(
          json_extract(scenes.access, '$.' || ${escapeLiteral(user_id.toString(10))}),
          ${(0 < user_id)? `json_extract(scenes.access, '$.1'),`:""}
          json_extract(scenes.access, '$.0')
      ) IN (${ AccessTypes.slice(AccessTypes.indexOf(accessMin)).map(s=>`'${s}'`).join(", ") })
    `;
  }

  static _fragIsThumbnail(field :string = "name"){
    return `(${field} = "scene-image-thumb.jpg" OR ${field} = "scene-image-thumb.png") AND size != 0`;
  }
  /**
   * Performs a type and limit check on a SceneQuery object and throws if anything is unacceptable
   * @param q 
   */
  static _validateSceneQuery(q :Readonly<SceneQuery|any>):SceneQuery{
    //Check various parameters compliance
    if(Array.isArray(q.access)){
      let badIndex = q.access.findIndex((a:any)=>AccessTypes.indexOf(a) === -1);
      if(badIndex !== -1) throw new BadRequestError(`Bad access type requested : ${q.access[badIndex]}`);
    }
    if(typeof q.author !== "undefined" && (!Number.isInteger(q.author) || q.author < 0)){
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
    if(typeof q.orderBy !== "undefined" && (typeof q.orderBy !== "string" || ["ctime", "mtime", "name"].indexOf(q.orderBy.toLowerCase()) === -1)){
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
    let with_filter = typeof user_id === "number" || match || typeof author === "number" || access?.length  || typeof archived === "boolean";
    const args = [
      (user_id? user_id.toString(10) : (access?.length? "0": undefined)),
      offset,
      limit,
      author,
    ]
    const sortString = (orderBy == "name")? "LOWER(scene_name)": orderBy;
    
    let likeness = "";

    function addMatch(matchString :string, index :number) :string{
      let fuzzyMatch = matchString;
      if(matchString.startsWith("^")) fuzzyMatch = fuzzyMatch.slice(1);
      else if(!matchString.startsWith("%")) fuzzyMatch = "%"+ fuzzyMatch;

      if(matchString.endsWith("$")) fuzzyMatch = fuzzyMatch.slice(0, -1);
      else if(!matchString.endsWith("%")) fuzzyMatch = fuzzyMatch + "%";

      const idx = args.push(fuzzyMatch, matchString) -1;

      let conditions = [
        `name LIKE $${idx}`,
        `docs.meta LIKE $${idx}`,
        `author = ${idx+1}`,
        `json_extract(scenes.access, '$.' || ${idx+1}) IN (${AccessTypes.slice(2).map(a=>`'${a}'`).join(", ")})`,
      ]
      return `${index ==0 ? " ": " AND "}( ${conditions.join(" OR ")} )`;
    }


    if(match){
      let words = 0;
      likeness = `AND (`;
      let quoted = false;
      let ms = "";
      [...match].forEach(c=>{
        if(c == '"')    quoted = !quoted;
        else if(c != " " || quoted) ms += c;
        else{
          likeness += addMatch(ms, words++);
          ms = "";
        }
      });
      if(ms.length) likeness += addMatch(ms, words++);
      likeness += `)`;
    }

    return (await this.db.all<{
      id:number,
      name:string,
      ctime: string,
      mtime: string,
      author_id: number,
      author: string,
      thumb: string|null,
      tags: string,
      access: string,
      archived: number,
    }>(`
      WITH 
        docs AS (
          SELECT json_extract(data, "$.metas") AS meta, ctime AS mtime, fk_scene_id
          FROM current_files
          WHERE mime = "application/si-dpo-3d.document+json" AND data IS NOT NULL
        ),
        thumbnails AS (
          SELECT name, ctime, fk_scene_id
          FROM current_files
          WHERE ${ScenesVfs._fragIsThumbnail()}
        )
      SELECT 
        scenes.scene_id AS id,
        scenes.scene_name AS name,
        scenes.ctime AS ctime,
        scenes.archived AS archived,
        IFNULL(docs.mtime, scenes.ctime) as mtime,
        scenes.fk_author_id AS author_id,
        IFNULL((
          SELECT username FROM users WHERE scenes.fk_author_id = user_id
        ), "default") AS author,
        (SELECT name FROM thumbnails WHERE fk_scene_id = scene_id ORDER BY ctime DESC, name ASC LIMIT 1) AS thumb,
        tags.names AS tags,
        json_object(
          ${(typeof user_id === "number" && 0 < user_id)? `
            "user", IFNULL(json_extract(scenes.access, '$.' || $1), "none"),
          ` :""}
          "any", json_extract(scenes.access, '$.1'),
          "default", json_extract(scenes.access, '$.0')
        ) AS access
      
      FROM scenes
        LEFT JOIN docs ON docs.fk_scene_id = scene_id
        LEFT JOIN (
          SELECT 
            json_group_array(tag_name) AS names,
            fk_scene_id
          FROM tags
          GROUP BY fk_scene_id
        ) AS tags ON tags.fk_scene_id = scene_id
      ${with_filter? "WHERE true": ""}
      ${typeof author === "number"? `AND author_id = $4`:"" }
      ${typeof user_id === "number"? `AND ${ScenesVfs._fragUserCanAccessScene(user_id, "read")}`:""}
      ${(access?.length)? `AND json_extract(scenes.access, '$.' || $1) IN (${ access.map(s=>`'${s}'`).join(", ") })`:""}
      ${typeof archived === "boolean"? `AND archived ${archived?"IS NOT":"IS"} 0`:""}
      ${likeness}

      GROUP BY scene_id
      ORDER BY ${sortString} ${orderDirection.toUpperCase()}
      LIMIT $2, $3
    `, args)).map(({ctime, mtime, id, access, archived, ...m})=>({
      ...m,
      id,
      tags: m.tags ? JSON.parse(m.tags): [],
      access: JSON.parse(access),
      ctime: BaseVfs.toDate(ctime),
      mtime: BaseVfs.toDate(mtime),
      archived: !!archived,
    }));
  }

  /**
   * Gets the scene, with access property truncated to show only user-visible data.
   * Use userManager.getPermissions to get the full access map
   */
  async getScene(nameOrId :string|number, user_id?:number) :Promise<Scene>{
    let key = ((typeof nameOrId =="number")? "scene_id":"scene_name");
    let args = [nameOrId];
    if(user_id) args.push(user_id.toString(10))
    let scene = await this.db.get<{
      name: string,
      id: number,
      ctime :string,
      author_id: number,
      author: string,
      access: string,
      archived: number,
    }>(`
      SELECT 
        scene_name as name,
        scene_id as id,
        ctime,
        archived,
        fk_author_id AS author_id,
        IFNULL((
          SELECT username FROM users WHERE user_id = fk_author_id
        ), 'default') AS author,
        json_object(
          ${(user_id)? `"user", IFNULL(json_extract(scenes.access, '$.' || $2), "none"),`: ``}
          "any", json_extract(scenes.access, '$.1'),
          "default", json_extract(scenes.access, '$.0')
        ) AS access
      FROM scenes WHERE ${key} = $1`, args);
    
    if(!scene) throw new NotFoundError(`No scene found with ${key}: ${nameOrId}`);
    
    let tags = await this.db.all<{name:string}>(`
      SELECT 
        tag_name AS name
      FROM tags
      WHERE tags.fk_scene_id = $1
    `,[scene.id]);

    let r = await this.db.get<{mtime:string, thumb?:string}>(`
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
      access: JSON.parse(scene.access),
      ctime: BaseVfs.toDate(scene.ctime),
      mtime: BaseVfs.toDate(r?.mtime ?? scene.ctime),
      archived: !!scene.archived,
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
  async getSceneHistory(id :number, query:Pick<SceneQuery,"limit"|"offset"|"orderDirection"> ={}) :Promise<Array<HistoryEntry>>{
    const {limit = 10, offset = 0, orderDirection = "desc"} = ScenesVfs._validateSceneQuery(query);

    const dir = orderDirection.toUpperCase() as Uppercase<typeof orderDirection>;
    let entries = await this.db.all<Omit<Stored<ItemEntry>,"mtime">>(`
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
      INNER JOIN users ON author_id = user_id
      WHERE fk_scene_id = $1
      ORDER BY ctime ${dir}, name ${dir}, generation ${dir}
      LIMIT $2, $3
    `, [
      id,
      offset,
      limit,
    ]);

    return entries.map(m=>({
      ...m,
      ctime: BaseVfs.toDate(m.ctime),
    }));
  }

}
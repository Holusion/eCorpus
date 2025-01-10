import { AccessMap, AccessType, AccessTypes } from "../auth/UserManager.js";
import config from "../utils/config.js";
import { BadRequestError, ConflictError,  NotFoundError } from "../utils/errors.js";
import { Uid } from "../utils/uid.js";
import BaseVfs from "./Base.js";
import { HistoryEntry, ItemEntry, ItemProps, Scene, SceneQuery, Stored } from "./types.js";


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
            $scene_name,
            $scene_id,
            $access,
            $author
          )
          RETURNING scene_id AS scene_id;
        `, {
          $scene_name:name, 
          $scene_id: uid,
          $access: JSON.stringify(permissions),
          $author: author_id,
        });
        return r.scene_id;
      }catch(e){
        if((e as any).code == "SQLITE_CONSTRAINT"){
          if(/UNIQUE.*scene_id/.test((e as any).message)){
            continue;
          }else if(/UNIQUE.*scene_name/.test((e as any).message)){
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
    let r = await this.db.run(`DELETE FROM scenes WHERE ${typeof scene ==="number"? "scene_id": "scene_name"} = $scene`, {$scene:scene});
    if(!r?.changes) throw new NotFoundError(`No scene found matching : ${scene}`);
  }
  /**
   * set a scene access to "none" for everyone, effectively making it hidden
   * @see UserManager.grant for a more granular setup
   */
  async archiveScene(scene :number|string){
    let r = await this.db.run(`
      UPDATE scenes 
      SET access = json_object('0', 'none'), scene_name = scene_name || '#' || scene_id
      WHERE 
        ${typeof scene ==="number"? "scene_id": "scene_name"} = $scene 
        ${typeof scene ==="number"? `AND INSTR(scene_name, '#' || scene_id) = 0`:""}
    `, {$scene: scene});
    if(!r?.changes) throw new NotFoundError(`No scene found matching : ${scene}`);
  }

  async renameScene($scene_id :number, $nextName :string){
    let r = await this.db.run(`
      UPDATE scenes
      SET scene_name = $nextName
      WHERE scene_id = $scene_id
    `, {$scene_id, $nextName});
    if(!r?.changes) throw new NotFoundError(`no scene found with id: ${$scene_id}`);
  }

  /**
   * Reusable fragment to check if a user has the required access level for an operation on a scene.
   * Most permission checks are done outside of this module in route middlewares,
   * but we sometimes need to check for permissions to filter list results
   * @param user_id User_id, to detect "default" special case
   * @param accessMin Minimum expected acccess level, defaults to read
   * @returns 
   */
  static _fragUserCanAccessScene(user_id :number, accessMin:AccessType = "read"){
    return `COALESCE(
        json_extract(scenes.access, '$.' || $user_id),
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
  static _parseSceneQuery(q :SceneQuery):SceneQuery{
    //Check various parameters compliance
    if(Array.isArray(q.access)){
      let badIndex = q.access.findIndex(a=>AccessTypes.indexOf(a) === -1);
      if(badIndex !== -1) throw new BadRequestError(`Bad access type requested : ${q.access[badIndex]}`);
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
   * Get only archived scenes.
   */
  async getScenes(user_id:null, q :{access:["none"]}) :Promise<Scene[]>;
  async getScenes(user_id ?:number|null, q:SceneQuery = {}) :Promise<Scene[]>{
    const {access, match, limit =10, offset = 0, orderBy="name", orderDirection="asc"}  = ScenesVfs._parseSceneQuery(q);
    let with_filter = typeof user_id === "number" || match || access?.length;

    const sortString = (orderBy == "name")? "LOWER(scene_name)": orderBy;

    let likeness = "";
    let mParams :Record<string, string> = {};

    function addMatch(ms :string, index :number) :string{
      let name = `$match${index}`;
      let fname = `$fmatch${index}`; //fuzzy
      let fm = ms;
      if(ms.startsWith("^")) fm = fm.slice(1);
      else if(!ms.startsWith("%")) fm = "%"+ fm;

      if(ms.endsWith("$")) fm = fm.slice(0, -1);
      else if(!ms.endsWith("%")) fm = fm + "%";

      mParams[fname] = fm;
      mParams[name] = ms;

      let conditions = [
        `name LIKE ${fname}`,
        `docs.meta LIKE ${fname}`,
        `author = ${name}`,
        `json_extract(scenes.access, '$.' || ${name}) IN (${AccessTypes.slice(2).map(a=>`'${a}'`).join(", ")})`,
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
    }[]>(`
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
        IFNULL(docs.mtime, scenes.ctime) as mtime,
        scenes.fk_author_id AS author_id,
        IFNULL((
          SELECT username FROM users WHERE scenes.fk_author_id = user_id
        ), "default") AS author,
        (SELECT name FROM thumbnails WHERE fk_scene_id = scene_id ORDER BY ctime DESC, name ASC LIMIT 1) AS thumb,
        tags.names AS tags,
        json_object(
          ${(typeof user_id === "number" && 0 < user_id)? `
            "user", IFNULL(json_extract(scenes.access, '$.' || $user_id), "none"),
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
      ${typeof user_id === "number"? `AND ${ScenesVfs._fragUserCanAccessScene(user_id, "read")}`:""}
      ${(access?.length)? `AND json_extract(scenes.access, '$.' || $user_id) IN (${ access.map(s=>`'${s}'`).join(", ") })`:""}
      ${likeness}

      GROUP BY scene_id
      ORDER BY ${sortString} ${orderDirection.toUpperCase()}
      LIMIT $offset, $limit
    `, {
      ...mParams,
      $user_id: (user_id? user_id.toString(10) : (access?.length? "0": undefined)),
      $limit: limit,
      $offset: offset,
    })).map(({ctime, mtime, id, access, ...m})=>({
      ...m,
      id,
      tags: m.tags ? JSON.parse(m.tags): [],
      access: JSON.parse(access),
      ctime: BaseVfs.toDate(ctime),
      mtime: BaseVfs.toDate(mtime),
    }));
  }

  /**
   * Gets the scene, with access property truncated to show only user-visible data.
   * Use userManager.getPermissions to get the full access map
   */
  async getScene(nameOrId :string|number, user_id?:number) :Promise<Scene>{
    let key = ((typeof nameOrId =="number")? "scene_id":"scene_name");
    let scene = await this.db.get<{
      name: string,
      id: number,
      ctime :string,
      author_id: number,
      author: string,
      access: string,
    }>(`
      SELECT 
        scene_name as name,
        scene_id as id,
        ctime,
        fk_author_id AS author_id,
        IFNULL((
          SELECT username FROM users WHERE user_id = fk_author_id
        ), 'default') AS author,
        json_object(
          ${(user_id)? `"user", IFNULL(json_extract(scenes.access, '$.' || $user_id), "none"),`: ``}
          "any", json_extract(scenes.access, '$.1'),
          "default", json_extract(scenes.access, '$.0')
        ) AS access
      FROM scenes WHERE ${key} = $value`, {$value: nameOrId, $user_id: user_id? user_id.toString(10): undefined});
    
    if(!scene) throw new NotFoundError(`No scene found with ${key}: ${nameOrId}`);
    
    let tags = await this.db.all<{name:string}[]>(`
      SELECT 
        tag_name AS name
      FROM tags
      WHERE tags.fk_scene_id = $scene_id
    `, {$scene_id: scene.id});

    let r = await this.db.get<{mtime:string, thumb?:string}>(`
      WITH scene_files AS (
        SELECT *
        FROM current_files
        WHERE fk_scene_id = $scene_id
      )
      SELECT 
        (SELECT MAX(ctime) FROM scene_files) AS mtime,
        (SELECT name FROM scene_files WHERE ${ScenesVfs._fragIsThumbnail()} ORDER BY ctime DESC, name ASC LIMIT 1) AS thumb
    `, {$scene_id: scene.id});
    return {
      ...scene,
      access: JSON.parse(scene.access),
      ctime: BaseVfs.toDate(scene.ctime),
      mtime: BaseVfs.toDate(r?.mtime ?? scene.ctime),
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
    const {limit = 10, offset = 0, orderDirection = "desc"} = ScenesVfs._parseSceneQuery(query);

    const dir = orderDirection.toUpperCase() as Uppercase<typeof orderDirection>;
    let entries = await this.db.all<Omit<Stored<ItemEntry>,"mtime">[]>(`
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
      WHERE fk_scene_id = $scene
      ORDER BY ctime ${dir}, name ${dir}, generation ${dir}
      LIMIT $offset, $limit
    `, {
      $scene: id,
      $offset: offset,
      $limit: limit,
    });

    return entries.map(m=>({
      ...m,
      ctime: BaseVfs.toDate(m.ctime),
    }));
  }

}
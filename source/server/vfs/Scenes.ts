import { AccessMap, AccessType, AccessTypes } from "../auth/UserManager.js";
import config from "../utils/config.js";
import { BadRequestError, ConflictError,  NotFoundError } from "../utils/errors.js";
import { Uid } from "../utils/uid.js";
import BaseVfs from "./Base.js";
import { ItemEntry, Scene, SceneQuery } from "./types.js";


export default abstract class ScenesVfs extends BaseVfs{

  async createScene(name :string):Promise<number>
  async createScene(name :string, author_id :number):Promise<number>
  async createScene(name :string, permissions:AccessMap):Promise<number>
  async createScene(name :string, perms ?:AccessMap|number) :Promise<number>{
    let permissions :AccessMap = (typeof perms === "object")? perms : {};
    //Always provide permissions for default user
    permissions['0'] ??= (config.public?"read":"none");
    permissions['1'] ??= "read";
    //If an author_id is provided, it is an administrator
    if(typeof perms === "number" ) permissions[perms.toString(10)] = "admin";

    for(let i=0; i<3; i++){
      try{
        let uid = Uid.make();
        //Unlikely, but still: skip uid that would prevent scene archiving
        if(name.endsWith("#"+uid.toString(10))) continue;

        let r = await this.db.get(`
          INSERT INTO scenes (scene_name, scene_id, access) 
          VALUES (
            $scene_name,
            $scene_id,
            $access
          )
          RETURNING scene_id AS scene_id;
        `, {
          $scene_name:name, 
          $scene_id: uid,
          $access: JSON.stringify(permissions)
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
  async getScenes(user_id ?:number|null, {access, match, limit =10, offset = 0, orderBy="name", orderDirection="asc"} :SceneQuery = {}) :Promise<Scene[]>{

    //Check various parameters compliance
    if(Array.isArray(access) && access.find(a=>AccessTypes.indexOf(a) === -1)){
      throw new BadRequestError(`Bad access type requested : ${access.join(", ")}`);
    }

    if(typeof limit !="number" || Number.isNaN(limit) || limit < 0) throw new BadRequestError(`When provided, limit must be a number`);
    if(typeof offset != "number" || Number.isNaN(offset) || offset < 0) throw new BadRequestError(`When provided, offset must be a number`);

    if(["asc", "desc"].indexOf(orderDirection.toLowerCase()) === -1) throw new BadRequestError(`Invalid orderDirection: ${orderDirection}`);
    if(["ctime", "mtime", "name"].indexOf(orderBy.toLowerCase()) === -1) throw new BadRequestError(`Invalid orderBy: ${orderBy}`);

    let with_filter = typeof user_id === "number" || match || access?.length;

    const sortString = (orderBy == "name")? "LOWER(scene_name)": orderBy;

    let likeness = "";
    let mParams :Record<string, string> = {};

    function addMatch(ms :string, words :number){
      let name = `$match${words}`;
      let fname = `$fmatch${words}`; //fuzzy
      let fm = ms;
      if(ms.startsWith("^")) fm = fm.slice(1);
      else if(!ms.startsWith("%")) fm = "%"+ fm;

      if(ms.endsWith("$")) fm = fm.slice(0, -1);
      else if(!ms.endsWith("%")) fm = fm + "%";

      mParams[fname] = fm;
      mParams[name] = ms;

      likeness += `${words ==0 ? " ": " AND "}(
        name LIKE ${fname}
        OR document.metas LIKE ${fname}
        OR author = ${name}
        OR json_extract(access, '$.' || ${name}) IN (${AccessTypes.slice(2).map(a=>`'${a}'`).join(", ")})
        OR access LIKE '%"' || ${name} || '":%'
      )`;
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
          addMatch(ms, words++);
          ms = "";
        }
      });
      if(ms.length) addMatch(ms, words++);
      likeness += `)`;
    }



    return (await this.db.all(`
      WITH last_docs AS (
        SELECT 
          documents.ctime AS mtime, 
          documents.fk_author_id AS fk_author_id,
          documents.fk_scene_id AS fk_scene_id,
          json_extract(documents.data, '$.metas') AS metas
        FROM (
            SELECT MAX(generation) AS generation, fk_scene_id FROM documents GROUP BY fk_scene_id
          ) AS last_docs
          LEFT JOIN documents
          ON 
            last_docs.fk_scene_id = documents.fk_scene_id 
            AND last_docs.generation = documents.generation
      )

      SELECT 
        IFNULL(mtime, scenes.ctime) as mtime,
        scenes.ctime AS ctime,
        scene_id AS id,
        scene_name AS name,
        IFNULL(fk_author_id, 0) AS author_id,
        IFNULL((
          SELECT username FROM users WHERE fk_author_id = user_id
        ), "default") AS author,
        json_extract(thumb.value, '$.uri') AS thumb,
        tags.names AS tags,
        json_object(
          ${(typeof user_id === "number" && 0 < user_id)? `
            "user", IFNULL(json_extract(scenes.access, '$.' || $user_id), "none"),
          ` :""}
          "any", json_extract(scenes.access, '$.1'),
          "default", json_extract(scenes.access, '$.0')
        ) AS access
      
      FROM scenes
        LEFT JOIN last_docs AS document ON document.fk_scene_id = scene_id
        LEFT JOIN json_tree(document.metas) AS thumb ON thumb.fullkey LIKE "$[_].images[_]" AND json_extract(thumb.value, '$.quality') = 'Thumb'
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
      $limit: Math.min(limit, 100),
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
    let r = await this.db.get(`
      SELECT
        scene_name AS name,
        scene_id AS id,
        scenes.ctime AS ctime,
        IFNULL(documents.ctime, scenes.ctime) AS mtime,
        IFNULL(fk_author_id, 0) AS author_id,
        IFNULL((
          SELECT username FROM users WHERE user_id = fk_author_id
        ), 'default') AS author,
        json_extract(thumb.value, '$.uri') AS thumb,
        tags.names AS tags,
        json_object(
          ${(user_id)? `"user", IFNULL(json_extract(scenes.access, '$.' || $user_id), "none"),`: ``}
          "any", json_extract(scenes.access, '$.1'),
          "default", json_extract(scenes.access, '$.0')
        ) AS access
      FROM scenes 
        LEFT JOIN documents ON documents.fk_scene_id = scene_id
        LEFT JOIN json_tree(documents.data, "$.metas") AS thumb ON thumb.fullkey LIKE "$[_].images[_]" AND json_extract(thumb.value, '$.quality') = 'Thumb'
        LEFT JOIN (
          SELECT 
            json_group_array(tag_name) AS names,
            fk_scene_id
          FROM tags
          GROUP BY fk_scene_id
        ) AS tags ON tags.fk_scene_id = scene_id
      WHERE ${key} = $value
      ORDER BY generation DESC
      LIMIT 1
    `, {$value: nameOrId, $user_id: user_id? user_id.toString(10): undefined});
    if(!r|| !r.name) throw new NotFoundError(`No scene found with ${key}: ${nameOrId}`);
    return {
      ...r,
      tags: r.tags ? JSON.parse(r.tags): [],
      access: JSON.parse(r.access),
      ctime: BaseVfs.toDate(r.ctime),
      mtime: BaseVfs.toDate(r.mtime),
    }
  }

  /**
   * Get every version of anything contained in this scene.
   * This could get quite large...
   * 
   * Return order is **DESCENDING** over ctime, name, generation (so, new files first).
   * 
   * @warning It doesn't have any of the filters `listFiles` has.
   * @todo handle size limit and pagination
   * @see listFiles for a list of current files.
   */
  async getSceneHistory(id :number) :Promise<Array<ItemEntry>>{
    let entries = await this.db.all(`
      SELECT name, mime, id, generation, ctime, username AS author, author_id, size
      FROM(
        SELECT 
          "scene.svx.json" AS name,
          "application/si-dpo-3d.document+json" AS mime,
          doc_id AS id,
          generation,
          ctime,
          fk_author_id AS author_id,
          LENGTH(CAST(data AS BLOB)) AS size
        FROM documents
        WHERE fk_scene_id = $scene
        UNION ALL
        SELECT
          name,
          mime,
          file_id AS id,
          generation,
          ctime,
          fk_author_id AS author_id,
          size
        FROM files
        WHERE fk_scene_id = $scene
      )
      INNER JOIN users ON author_id = user_id
      ORDER BY ctime DESC, name DESC, generation DESC
    `, {$scene: id});

    return entries.map(m=>({
      ...m,
      ctime: BaseVfs.toDate(m.ctime),
    }));
  }

}
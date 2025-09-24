import { isatty } from "node:tty";
import { NotFoundError } from "../utils/errors.js";
import BaseVfs from "./Base.js";
import errors from "./helpers/errors.js";
import ScenesVfs from "./Scenes.js";
import { Tag } from "./types.js";
import { toAccessLevel } from "../auth/UserManager.js";
import { UserLevels } from "../auth/User.js";


export interface GetTagsParams{
  /** Match (regex), case insensitive with tag name */
  like?:string;
  /** Offset results*/
  offset?: number;
  /** Limit result set */
  limit?: number;
}

export default abstract class TagsVfs extends BaseVfs{

  /**
   * Set tags for a scene. Does not check for permissions
   * Returns true if a tag was added, false otherwise.
   * Throws an error on invalid scene ID
   */
  async addTag(scene_name :string, tag :string) :Promise<boolean>;
  async addTag(scene_id :number, tag :string) :Promise<boolean>;
  async addTag(scene :string|number, tag :string) :Promise<boolean>{
    let match = ((typeof scene ==="number")?'SELECT $2::bigint AS scene_id':`SELECT scene_id FROM scenes WHERE scene_name = $2`);
    try{
      let r = await this.db.run(`
        WITH 
          scene AS (${match}),
          tag AS (
            SELECT tag_name FROM tags WHERE tag_name = $1 COLLATE ignore_accent_case
            UNION ALL
            SELECT $1 AS tag_name
            LIMIT 1
          )
        INSERT INTO tags
          (tag_name, fk_scene_id)
        SELECT  tag_name, scene_id
        FROM scene, tag
      `, [
        tag,
        scene
      ]);
      if(!r.changes) throw new NotFoundError(`Can't find scene matching ${scene}`);
    }catch(e:any){
      if(e.code == errors.foreign_key_violation){
        throw new NotFoundError(`Can't find scene matching ${scene}`);
      }else if(e.code == errors.unique_violation){
        return false;
      }
      throw e;
    }
    return true;
  }

  /**
   * Returns true if something was changed, false otherwise
   */
  async removeTag(scene_name :string, tag :string): Promise<boolean>;
  async removeTag(scene_id :number, tag: string): Promise<boolean>;
  async removeTag(scene :number|string, tag :string):Promise<boolean>{
    let match = ((typeof scene === "number")?`fk_scene_id = $2`: `
      fk_scene_id IN (
        SELECT scene_id
        FROM scenes
        WHERE scene_name = $2
      )
    `);
    let r = await this.db.run(`
      DELETE FROM tags
      WHERE tag_name = $1 AND ${match}
    `, [
      tag,
      scene
    ]);
    return !!r.changes;
  }

  async getTags({like, offset, limit}: GetTagsParams ={}):Promise<Tag[]>{
    let args :any[]= [];
    let fragments = {like: "", offset: "", limit: ""};
    if(like){
      fragments.like = `AND tag_name ~* $${args.push(like)}::text COLLATE "default"`
    }
    if(typeof limit === "number"){
      fragments.limit = `LIMIT $${args.push(limit)}`;
    }
    if(typeof offset === "number"){
      fragments.offset = `OFFSET $${args.push(offset)}`;
    }

    return await this.db.all<Tag>(
      `
        SELECT 
          tag_name AS name,
          COUNT(fk_scene_id) as size
        FROM 
          tags
          INNER JOIN scenes ON fk_scene_id = scene_id
        WHERE scenes.archived IS NULL
          ${fragments.like}
        GROUP BY name
        ORDER BY name ASC
        ${fragments.limit}
        ${fragments.offset}
      `,
      args
    );
  }

  /** 
   * Get all scenes that have this tag, regardless of permissions
   * @fixme the JOIN could be optimized away in this case
   */
  async getTag(name :string):Promise<number[]>
  /** Get all scenes that have this tag that this user can read */
  async getTag(name :string, user_id :number | null):Promise<number[]>
  async getTag(name :string, user_id ?:number | null):Promise<number[]>{

    let args:any[] = [name];
    if(typeof user_id === "number"){
      args.push(user_id);
    }
    let scenes = await this.db.all<{scene_id:number}>(`
      SELECT scene_id , scene_name
      FROM tags 
      LEFT JOIN scenes ON fk_scene_id = scene_id
      LEFT JOIN users_acl ON users_acl.fk_scene_id = scene_id ${args.length == 2 ?`AND users_acl.fk_user_id = $2`:""}
      LEFT JOIN users ON ( users_acl.fk_user_id = user_id ${args.length == 2 ?`OR user_id = $2`:""} )
      WHERE (
        tags.tag_name = $1
        AND scenes.archived IS NULL
        ${args.length == 2 ? `AND ( 
          users.level = ${UserLevels.ADMIN} OR
          GREATEST(
            users_acl.access_level, 
            CASE WHEN users.level IS NOT NULL THEN scenes.default_access ELSE 0 END,
            public_access
          ) >= ${toAccessLevel("read")}
        )`: `AND public_access >= ${toAccessLevel("read")}`}
      )
      GROUP BY scene_id , scene_name
      ORDER BY scene_name ASC
    `, args);

    return scenes.map(s=>s.scene_id);
  }
}
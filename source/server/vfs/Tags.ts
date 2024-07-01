import { NotFoundError } from "../utils/errors.js";
import BaseVfs from "./Base.js";
import ScenesVfs from "./Scenes.js";
import { Tag } from "./types.js";


export default abstract class TagsVfs extends BaseVfs{

  /**
   * Set tags for a scene. Does not check for permissions
   * Returns true if a tag was added, false otherwise.
   * Throws an error on invalid scene ID
   */
  async addTag(scene_name :string, tag :string) :Promise<boolean>;
  async addTag(scene_id :number, tag :string) :Promise<boolean>;
  async addTag(scene :string|number, tag :string) :Promise<boolean>{
    let match = ((typeof scene ==="number")?'$scene':`scene_id FROM scenes WHERE scene_name = $scene`);
    try{
      let r = await this.db.run(`
        INSERT INTO tags
          (tag_name, fk_scene_id)
      SELECT $tag, ${match}
      `, {
        $tag: tag.toLowerCase(),
        $scene: scene
      });
      if(!r.changes) throw new NotFoundError(`Can't find scene matching ${scene}`);
    }catch(e:any){
      if(e.code === "SQLITE_CONSTRAINT" && /FOREIGN KEY/.test(e.message)){
        throw new NotFoundError(`Can't find scene matching ${scene}`);
      }else if(e.code === "SQLITE_CONSTRAINT" && /UNIQUE constraint/.test(e.message)){
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
    let match = ((typeof scene === "number")?`fk_scene_id = $scene`: `
      fk_scene_id IN (
        SELECT scene_id
        FROM scenes
        WHERE scene_name = $scene
      )
    `);
    let r = await this.db.run(`
      DELETE FROM tags
      WHERE tag_name = $tag AND ${match}
    `, {
      $tag: tag,
      $scene: scene
    });
    return !!r.changes;
  }

  async getTags(like ?:string):Promise<Tag[]>{
    let where :string = like?`WHERE tag_name LIKE '%' || $like || '%'` :"";
    return await this.db.all<Tag[]>(
      `
        SELECT 
          tag_name AS name,
          COUNT(fk_scene_id) as size
        FROM 
          tags,
          scenes
        ON fk_scene_id = scene_id
        ${where}
        GROUP BY name
        ORDER BY name ASC
      `,
      {$like: like}
    );
  }

  /** 
   * Get all scenes that have this tag, regrdless of permissions
   * @fixme the JOIN could be optimized away in this case
   */
  async getTag(name :string):Promise<number[]>
  /** Get all scenes that have this tag that this user can read */
  async getTag(name :string, user_id :number):Promise<number[]>
  async getTag(name :string, user_id ?:number):Promise<number[]>{
    
    let scenes = await this.db.all<{scene_id:number}[]>(`
      SELECT scene_id
      FROM 
        tags, 
        scenes
      ON fk_scene_id = scene_id
      WHERE 
        tags.tag_name = $name
        ${typeof user_id === "number"?`AND ${ScenesVfs._fragUserCanAccessScene(user_id, "read")}`:""}
      ORDER BY scene_name ASC
    `, {$name: name, $user_id: user_id?.toString(10)});

    return scenes.map(s=>s.scene_id);
  }
}
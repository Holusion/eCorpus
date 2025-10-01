import fs from "fs/promises";
import crypto, { randomBytes } from "crypto";
import path from "path";
import {promisify} from "util";

import uid, { Uid } from "../utils/uid.js";
import { BadRequestError, ConflictError, InternalError, NotFoundError, UnauthorizedError } from "../utils/errors.js";
import User, {SafeUser, StoredUser, UserLevels, UserRole, UserRoles} from "./User.js";

import openDatabase, {Database, DbController, DbOptions} from "../vfs/helpers/db.js";
import errors, { expandSQLError } from "../vfs/helpers/errors.js";
import Group, { StoredGroup } from "./Group.js";
import { group } from "console";


const scrypt :(
  password :crypto.BinaryLike, 
  salt :crypto.BinaryLike, 
  keylen :number,  
  options: crypto.ScryptOptions
)=>Promise<Buffer> = promisify(crypto.scrypt);

interface ParsedPassword {
  algo :string;
  params :{[key: string]: number}
  salt :string;
  hash :string;
}

/**
 * Ordered list of permission. 
 * Permissions are always a superset of anything under them so they can be index-compared.
 */
export const AccessTypes = [
  null,
  "none",
  "read",
  "write",
  "admin"
] as const;

export function fromAccessLevel(l:number):AccessType{
  return AccessTypes[l+1];
}

export function toAccessLevel(a:AccessType){
  return Math.max(0, AccessTypes.indexOf(a)-1);
}

export function isAccessType(type :any) :type is AccessType{
  return AccessTypes.indexOf(type) !== -1;
}

export type AccessType = typeof AccessTypes[number];

export type AccessMap = {[id: `${number}`|string]:AccessType};

export const any_id = 1 as const;
export const default_id = 0 as const;

export default class UserManager extends DbController {

  static async open(opts :DbOptions){
    let db = await openDatabase(opts);
    let u = new UserManager(db);
    return u;
  }
  /**
   * Checks if username is acceptable. Used both as input-validation and deserialization check
   * @see addUser()
   * @see UserManager.deserialize() 
   */
  static isValidUserName(username :string){
    return UserManager.isValid.username(username);
  }
  
  static isValidPasswordHash(hash :string) :boolean{
    try{
      UserManager.parsePassword(hash);
    }catch(e){
      return false;
    }
    return true;
  }

  static isValid = {
    username(username: string | any) {
      return typeof username === "string" && /^[-\w]{3,40}$/.test(username)
    },
    password(password: string | any) {
      return typeof password === "string" && 8 <= password.length
    },
    email(email:string|any){
      return typeof email === "string" && /^[^@]+@[^@]+\.[^@]+$/.test(email);
    }
  } as const;
  
  /**
   * 
   * @param pw a password string as encoded by formatPassword()
   * @returns 
   */
  static parsePassword(pw :string) :ParsedPassword{
    let m  = /^\$(?<algo>scrypt)(?:\$(?<params>(?:[^\$=]+=[^\$]+\$)*))?(?<salt>[^\$]+)\$(?<hash>[^\$]+)$/.exec(pw);
    if(!m?.groups) throw new Error("Malformed password string");
    let {algo, salt, hash, params:rawParams} = m.groups;
    //@ts-ignore
    let params = rawParams.split("$").slice(0,-1).reduce((params :{[key :string] :number}, param :string)=> {
      let [key, value] = param.split("=");
      return {...params, [key]: parseInt(value, 10)};
    },{});
    return {algo, salt, hash, params};
  }

  /**
   * Encode a clear-text password into a string. 
   * Includes all encoding parameters in the string with a randomly generated salt
   */
  static async formatPassword(pw :string) :Promise<string>{
    let salt = crypto.randomBytes(16).toString("base64url");
    let length = 64;
    let params = {N: 16384, r: 8, p: 1 };
    let key = await scrypt(pw, salt, length,  params);
    return `$scrypt$${Object.entries(params).map(([key, value])=>(`${key}=${value}`)).join("$")}$${salt}$${key.toString("base64url")}`;
  }

  /**
   * 
   * @param password clear-text password
   * @param hash encoded string to compare against
   */
  static async verifyPassword(password :string, hash :string) :Promise<boolean>{
    let {algo, salt, hash:storedHash, params} = UserManager.parsePassword(hash);
    if(algo != "scrypt") throw new Error(`bad password algorithm : ${algo}`);
    let key = await scrypt(password, salt, Buffer.from(storedHash, "base64url").length, params);
    return key.toString("base64url") == storedHash;
  }
  /**
   * parse a string (eg. made by `UserManager.serialize()`) into a valid user.
   * Performs necessary validity checks
   * Any errors will try to hide sensitive data like the user's password
   * @see UserManager.serialize()
   */
  static deserialize(u :StoredUser) :User{
    return  new User({
      username: u.username, 
      email: u.email??undefined,
      uid: u.user_id,
      level: UserRoles[u.level],
      password: u.password, 
    });
  }

  static serialize({username, email, password, uid, level} :User) :StoredUser{
    return {
      username,
      email,
      password,
      user_id: uid,
      level: UserRoles.indexOf(level),
    };
  }


  /**
   * Write user data to disk. use addUser to generate a valid new user
   * @param user 
   */
  async write(user :User) :Promise<void>{
    let u = UserManager.serialize(user);
    await this.db.run(`
      INSERT INTO users (user_id, username, email, password, level)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      u.user_id,
      u.username,
      u.email ?? null,
      u.password ?? null,
      u.level,
    ]);
  }


  /**
   * Reads users file and checks users validity.
   * Also allow requests by email
   * @throws {BadRequestError} is username is invalid
   * @throws {NotFoundError} is username is not found
   * @throws {Error} if fs.readFile fails (generally with error.code == ENOENT)
   */
  async getUserByName(username : string) :Promise<User>{
    if(!UserManager.isValidUserName(username) && username.indexOf("@")== -1) throw new BadRequestError(`Invalid user name`);
    let u = await this.db.get<StoredUser>(`SELECT * FROM users WHERE username = $1 OR email = $1`, [ username ]);
    if(!u) throw new NotFoundError(`no user with username ${username}`);
    return UserManager.deserialize(u);
  }
  
  /**
   * List users
   */
   async getUsers() :Promise<SafeUser[]>
   async getUsers(safe :true) :Promise<SafeUser[]>
   async getUsers(safe :false) :Promise<User[]>
   async getUsers(safe :boolean =true){
    return (await this.db.all<StoredUser>(`
      SELECT ${safe?"user_id, username, email, level":"*"} 
      FROM users
      WHERE user_id NOT IN (0, 1)`)).map(u=>UserManager.deserialize(u));
  }

  async userCount() :Promise<number>{
    let r = await this.db.get(`SELECT COUNT(user_id) as count FROM users`);
    if(!r) throw new InternalError(`Bad db configuration : can't get user count`);
    return r.count;
  }
  /**
   * 
   * @param name 
   * @param password clear-text password 
   * @param callback 
   * @throws {UnauthorizedError}
   */
  async getUserByNamePassword(name : string, password : string) :Promise<User>{
    let u = await this.getUserByName(name);
    if(!u?.password) throw new UnauthorizedError("Username not found");
    if(!await UserManager.verifyPassword(password, u.password)){
      throw new UnauthorizedError("Bad password");
    }else{
      return u;
    }
  }
  /**
   * Performs any necessary checks and create a new user
   * @param password clear-text password
   */
  async addUser(username : string, password : string, level : UserRole = "create", email ?:string) : Promise<User>{ 
    if(!UserManager.isValidUserName(username)) throw new Error(`Invalid username : ${username}`);
    if(password.length < 8) throw new Error(`Password too short (min. 8 char long)`);
    if(UserRoles.indexOf(level) === -1) throw new Error(`Invalid user role : ${level}`);
    let user = new User({
      username, 
      password: await UserManager.formatPassword(password), 
      email: email,
      level, 
      uid: 0,
    });

    for(let i = 0; i < 3; i++){
      //Retry 3 times in case we are unlucky with the RNG
      try{
        /* 48bits is a safe integer (ie. less than 2^53-1)*/
        user.uid = Uid.make();
        await this.write(user);
        break;
      }catch(e:any){
        if(e.code == errors.unique_violation && e.constraint === "users_user_id_key") continue;
        if(e.code == errors.unique_violation && e.constraint === "users_username_key") throw new ConflictError(`username ${username} already exists`);
        if(e.code == errors.unique_violation && e.constraint === "users_email_key") throw new ConflictError(`email ${email} already exists`);
        else throw e;
      }
    }
    return user;
  }

  async patchUser(uid :number, u :Partial<User>){
    let values = [], params :any[] = [uid.toString(10)];

    let keys = ["username", "password", "email", "level"]as Array<keyof Omit<User,"uid">>;
    for(let i = 0; i < keys.length; i++){
      let key = keys[i];
      let value = u[key];
      if(typeof value === "undefined") continue;
      if (key != "level") {
        let validator = UserManager.isValid[key];
        if(typeof validator === "function" && !validator(value)){
          throw new BadRequestError(`Bad value for ${key}: ${value}`);
        }
      }
      values.push( key + ` = $${params.length+1}`);

      if(key === "password"){
        params.push(await UserManager.formatPassword(value as string));
      } else if(key == "level"){
        params.push(UserRoles.indexOf(value as any));
      } else {
        params.push(value);
      }
    }
    if(values.length === 0){
      throw new BadRequestError(`Provide at least one valid value to change`);
    }
    let r = await this.db.get<StoredUser>(`
      UPDATE users 
      SET ${values.join(", ")} 
      WHERE user_id = $1
      RETURNING *
    `, params);
    if(!r) throw new NotFoundError(`Can't find user with uid : ${uid}`);
    return UserManager.deserialize(r);
  }

  async removeUser(uid :number){
    let r = await this.db.run(`DELETE FROM users WHERE user_id = $1`, [ uid.toString(10) ]);
    if(!r || !r.changes) throw new NotFoundError(`No user to delete with uid ${uid}`);
  }

  /**
   * patches permissions on a scene for a given user.
   * Usernames are converted to IDs before being used.
   * > As per [rfc7396](https://datatracker.ietf.org/doc/html/rfc7396), 
   * > Null values in the merge patch are given special meaning to indicate the removal
   * > of existing values in the target.
   * 
   * @param scene scene name or id
   * @param user username or user_id to grant access to
   * @param role 
   */
  async grant(scene :string|number, user :string|number, role :AccessType){
    if(!isAccessType(role)) throw new BadRequestError(`Bad access type requested : ${role}`);
    let scene_id = `(${(typeof scene === "number")?`SELECT $1::bigint AS scene_id`:`SELECT scene_id FROM scenes WHERE scene_name = $1`})`
    let user_id =  `(${(typeof user === "number")?`SELECT $2::bigint AS user_id`:`SELECT user_id FROM users WHERE username = $2`})`;
    let level = toAccessLevel(role);
    if(0 < level){
      try{
        await this.db.run(`
          INSERT INTO users_acl (fk_user_id, fk_scene_id, access_level)
          SELECT ${user_id}, ${scene_id}, $3
          ON CONFLICT (fk_user_id, fk_scene_id) DO UPDATE SET access_level = EXCLUDED.access_level
        `, [
          scene,
          user,
          level
        ]);
      }catch(e:any){
        if(e.code === errors.not_null_violation && e.table === "users_acl" && e.column === "fk_user_id"){
          throw new NotFoundError( (typeof user === "number")? `User ID can't be null` : `Invalid username ${user}`);
        }else if(e.code === errors.foreign_key_violation && e.table === "users_acl" && e.constraint === 'users_acl_fk_user_id_fkey'){
          throw new NotFoundError(`Invalid user ID ${user}`);
        }else if(e.code === errors.not_null_violation && e.table === "users_acl" && e.column === "fk_scene_id"){
          throw new NotFoundError(`Scene ${scene} does not exist`);
        }
        throw e;
      }
    }else{
      let r = await this.db.run(`
        DELETE FROM users_acl
        WHERE (fk_scene_id IN ${scene_id} AND fk_user_id IN ${user_id})
      `, [
        scene,
        user,
      ]);
      if(!r || !r.changes){
        throw new NotFoundError(`Can't find matching user or scene`);
      }
    }
  }

  async getAccessRights(scene :string | number, uid :number | undefined | null) :Promise<AccessType>{
    const res = await this.db.get( typeof uid == "number" ? `
      SELECT max(level) as level
      FROM
      (SELECT GREATEST(
        users_acl.access_level,
        CASE 
          WHEN (SELECT level FROM users WHERE user_id = $2) IS NOT NULL THEN scenes.default_access 
          ELSE 0 END,
        scenes.public_access,
        user_is_admin_level.level,
        groups.access_level
      ) AS level
      FROM
        scenes
        LEFT JOIN (        
          SELECT CASE level WHEN ${UserLevels.ADMIN} THEN ${toAccessLevel("admin")} ELSE NULL END AS level
          FROM users
          WHERE user_id = $2
        ) AS user_is_admin_level ON TRUE
        LEFT OUTER JOIN users_acl ON (fk_scene_id = scenes.scene_id AND fk_user_id = $2)
        LEFT OUTER JOIN (
          SELECT * 
            FROM groups_acl INNER JOIN groups_membership ON (groups_acl.fk_group_id = groups_membership.fk_group_id)
           WHERE fk_user_id = $2)
          AS groups ON (groups.fk_scene_id = scenes.scene_id AND groups.fk_user_id = $2) 
      WHERE ${typeof scene === "number" ?
        "scene_id = $1"
        : "scene_name = $1"}
      ) AS levels` :
      // Request when no uid :
      `SELECT public_access as level
      FROM scenes
      WHERE ${typeof scene ==="number"? 
        "scene_id = $1" : "scene_name = $1" }`
      , uid ? [scene, uid] : [scene]
    );
    if(!res || !res.level) throw new NotFoundError(`No scene with ${typeof scene ==="number"? `id ${scene}`: `name ${scene}`}`);
    return AccessTypes[res?.level+1];

  }

  /**
   * Get all access rights for a scene.
   * Access to this should be externally restricted to users with READ rights over this scene.
   * 
   * For this reason, this method is not really made safe: It won't throw a 404 if the requested scene doesn't exist.
   * @see https://www.sqlite.org/json1.html#jeach for json_each documentation
   */
  async getPermissions(nameOrId: string | number): Promise<({ uid: number, username: string, access: AccessType } | { groupUid: number, groupName: string, access: AccessType })[]> {
    let key = ((typeof nameOrId == "number") ? "scene_id" : "scene_name");
    let r = await this.db.all<{ uid: string, username: string | null, group_name: string | null, level: number }>(`
      SELECT 
        users.user_id AS uid,
        users.username AS username,
        NULL AS group_name,
        users_acl.access_level AS level
      FROM 
        scenes
        INNER JOIN users_acl ON users_acl.fk_scene_id = scenes.scene_id
        INNER JOIN users ON users_acl.fk_user_id = users.user_id
      WHERE scenes.${key} = $1
      UNION
        SELECT 
        groups.group_id AS uid,
        NULL AS username,
        groups.group_name AS group_name,
        groups_acl.access_level AS level
      FROM 
        scenes
        INNER JOIN groups_acl ON groups_acl.fk_scene_id = scenes.scene_id
        INNER JOIN groups ON groups_acl.fk_group_id = groups.group_id
      WHERE scenes.${key} = $1
    `, [
      (typeof nameOrId == "number") ? nameOrId.toString(10) : nameOrId,
    ]);
    return r.map(l => (l.username ? {
      uid: parseInt(l.uid),
      username: l.username,
      access: AccessTypes[l.level + 1]
    } : {
      groupUid: parseInt(l.uid),
      groupName: l.group_name as string,
      access: AccessTypes[l.level + 1]
    }));
    
  }

  async setPublicAccess(scene: string | number, role: "none" | "read"): Promise<void> {
    let is_id = typeof scene === "number";
    let level = toAccessLevel(role)
    if(level < 0 || 1 < level) throw new BadRequestError(`Can't set scene public access to ${role}`)
    let r = await this.db.run(`
      UPDATE scenes
      SET public_access = $2
      WHERE ${(is_id)?"scene_id":"scene_name"} = $1
      `, [
        scene,
        level,
      ]);    
    if(r?.changes != 1) throw new NotFoundError(`No scene found with ${(is_id)?"scene_id":"scene_name"} = ${scene}`);

  }

  async setDefaultAccess(scene: string|number, role:"none"|"read"|"write"):Promise<void>{
    let is_id = typeof scene === "number";
    try{
      let r = await this.db.run(`
        UPDATE scenes
        SET default_access = $2
        WHERE ${is_id?"scene_id":"scene_name"} = $1
        `, [
          scene,
          toAccessLevel(role),
        ]);
      if(r?.changes != 1) throw new NotFoundError(`No scene found with ${is_id?"scene_id":"scene_name"} = ${scene}`);

    }catch(e: any){
      if(e.code == errors.check_violation && e.constraint == "default_access_allowed_values"){
        throw new BadRequestError(`Invalid value for scene default access : ${role}`);
      }
      throw e;
    }
  }

  async getKeys() :Promise<string[]>{
    const keys = (
      await this.db.all<Record<"key_data", Buffer>>(`
        SELECT key_data FROM keys
        ORDER BY key_id DESC
      `)
    ).map(r=> r.key_data.toString("base64"));
    if(keys.length == 0){
      keys.push(await this.addKey());
    }
    return keys
  }
  async addKey(){
    let key = randomBytes(16);
    await this.db.run(`INSERT INTO keys (key_data) VALUES ($1);`, [key]);
    return key.toString("base64");
  }

  async addGroup(groupName: string) {
    try{
          return new Group(await this.db.get<StoredGroup>(`
      INSERT INTO groups (group_name)
      VALUES ($1)
      RETURNING *
    `, [
      groupName
    ]));
    }catch(e:any){
      if (e.code == errors.unique_violation && e.constraint === "groups_group_name_key")throw new ConflictError(`A group named ${groupName} already exists`)
      else throw e;
    }
  }

  async removeGroup(group: number | string) {
    let group_id = `(${(typeof group === "number") ? `SELECT $1::bigint AS group_id` : `SELECT group_id FROM groups WHERE group_name = $1`})`;
    let r = await this.db.run(`DELETE FROM groups WHERE group_id = ${group_id}`, [group]);
    if (!r || !r.changes) throw new NotFoundError(`No group ${group} to delete`);
  }

  async getGroup(groupName: string): Promise<Group> {
    let bdd_group = (await this.db.get<StoredGroup>(
      `SELECT 
        group_name,
        group_id, 
        jsonb_object_agg (COALESCE(scene_name,''::text), access_level)  - '' AS scenes,
        array_remove(ARRAY_AGG(DISTINCT username), NULL)  AS members 
        FROM groups 
        LEFT JOIN groups_acl ON groups_acl.fk_group_id = group_id
        LEFT JOIN scenes ON fk_scene_id = scene_id 
        LEFT JOIN groups_membership ON groups_membership.fk_group_id = group_id
        LEFT JOIN users ON groups_membership.fk_user_id = user_id
        WHERE group_name = $1
        GROUP BY group_name, group_id`, [groupName]));
    if (!bdd_group) throw new NotFoundError(`no group named ${groupName}`);
    return new Group(bdd_group);
  }

  async getGroups(): Promise<Group[]> {
    return ((await this.db.all<{ group_id: number, group_name: string }>(`
      SELECT * FROM groups`)).map(group => new Group(group)));
  }

  async getGroupsOfUser(user_id: number): Promise<Group[]> {
    return ((await this.db.all<{ group_id: number, group_name: string }>(`
      SELECT * 
      FROM groups
      JOIN groups_membership ON groups_membership.fk_group_id = group_id
      WHERE fk_user_id = $1
      `,[user_id])).map(group => new Group(group)));
  }

  async addMemberToGroup(user: number | string, group: number | string) {
    let group_id = `(${(typeof group === "number") ? `SELECT $1::bigint AS group_id` : `SELECT group_id FROM groups WHERE group_name = $1`})`;
    let user_id = `(${(typeof user === "number") ? `SELECT $2::bigint AS user_id` : `SELECT user_id FROM users WHERE username = $2`})`;
    try {
      let r = await this.db.run(` 
        INSERT INTO groups_membership (fk_group_id, fk_user_id)
        SELECT ${group_id}, ${user_id}`,
        [group, user]);
      if (!r || !r.changes) throw new NotFoundError(`No user ${user} to add `);
    }
    catch (e: any) {
      if (e.code == errors.not_null_violation && ((e.column == "fk_group_id") || (e.column == "fk_user_id"))) {
        if (e.column == "fk_user_id") {
          throw new NotFoundError("User " + user.toString() + " not found")
        } else {
          throw new NotFoundError("Group " + group.toString() + " not found")
        }
      }
      else if (e.code != errors.unique_violation) {
        throw e
      }
    }
  }

  async removeMemberFromGroup(user: number | string, group: number | string) {
    let group_id = `(${(typeof group === "number") ? `SELECT $1::bigint AS group_id` : `SELECT group_id FROM groups WHERE group_name = $1`})`;
    let user_id = `(${(typeof user === "number") ? `SELECT $2::bigint AS user_id` : `SELECT user_id FROM users WHERE username = $2`})`;

    let r = await this.db.run(`
      DELETE FROM groups_membership 
      WHERE fk_user_id = ${user_id} AND fk_group_id = ${group_id}`, [group, user]);
    if (!r || !r.changes) throw new NotFoundError(`No member ${user} to delete from group ${group}`);
  }

  /* This returns false is the group or user does not exist.
    It should not be exposed via any API routes.
    It is currently only used to check access rights for accessing to groups */
  async isMemberOfGroup(user: number | string, group: number | string) {
    let res: { fk_user_id: number };
    if (typeof (user) == "number") {
      res = (await this.db.get<{ fk_user_id: number }>(`SELECT fk_user_id FROM groups_membership ${typeof (group) == "string" ? `JOIN groups ON fk_group_id = group_id WHERE group_name = $2` : `WHERE fk_group_id = $2`} AND fk_user_id = $1`, [user, group]));
    } else {
      res = (await this.db.get<{ fk_user_id: number }>(`SELECT fk_user_id FROM groups_membership  JOIN users ON fk_user_id = user_id  ${typeof (group) == "string" ? `JOIN groups ON fk_group_id = group_id WHERE group_name = $2` : `WHERE fk_group_id = $2`} AND username = $1`, [user, group]));
    }
    return (res && (typeof (res.fk_user_id) === "number"))
  }


  /**
 * patches permissions on a scene for a given group.
 * Groupnames are converted to IDs before being used.
 * > As per [rfc7396](https://datatracker.ietf.org/doc/html/rfc7396), 
 * > Null values in the merge patch are given special meaning to indicate the removal
 * > of existing values in the target.
 * 
 * @param scene scene name or id
 * @param user username or user_id to grant access to
 * @param role 
 */
  async grantGroup(scene: string | number, group: string | number, role: AccessType) {
    if (!isAccessType(role)) throw new BadRequestError(`Bad access type requested : ${role}`);
    let scene_id = `(${(typeof scene === "number") ? `SELECT $1::bigint AS scene_id` : `SELECT scene_id FROM scenes WHERE scene_name = $1`})`
    let group_id = `(${(typeof group === "number") ? `SELECT $2::bigint AS group_id` : `SELECT group_id FROM groups WHERE group_name = $2`})`;
    let level = toAccessLevel(role);
    if (0 < level) {
      try {
        await this.db.run(`
          INSERT INTO groups_acl (fk_group_id, fk_scene_id, access_level)
          SELECT ${group_id}, ${scene_id}, $3
          ON CONFLICT (fk_group_id, fk_scene_id) DO UPDATE SET access_level = EXCLUDED.access_level
        `, [
          scene,
          group,
          level
        ]);
      } catch (e: any) {
        if (e.code === errors.not_null_violation && e.table === "groups_acl" && e.column === "fk_group_id") {
          throw new NotFoundError(`Group ID can't be null`);
        } else if (e.code === errors.foreign_key_violation && e.table === "groups_acl" && e.constraint === 'users_acl_fk_group_id_fkey') {
          throw new NotFoundError(`Invalid group ID ${group}`);
        } else if (e.code === errors.not_null_violation && e.table === "groups_acl" && e.column === "fk_scene_id") {
          throw new NotFoundError(`Scene ${scene} does not exist`);
        }
        throw e;
      }
    } else {
      let r = await this.db.run(`
        DELETE FROM groups_acl
        WHERE (fk_scene_id IN ${scene_id} AND fk_group_id IN ${group_id})
      `, [
        scene,
        group,
      ]);
      if (!r || !r.changes) {
        throw new NotFoundError(`Can't find matching group or scene`);
      }
    }
  }
}
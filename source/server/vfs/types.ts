import { Request } from "express";
import {ReadStream} from "fs";
import {Readable} from "stream";
import { AccessType } from "../auth/UserManager.js";
import { Dictionary } from "../utils/schema/types.js";
import { TLanguageType } from "../utils/schema/common.js";


export type DataStream = Readable|ReadStream|AsyncGenerator<Buffer|Uint8Array>|Request;


export interface CommonFileParams{
  /** Scene name or scene id */
  scene :string|number;
  name  :string;
}

export interface WriteFileParams extends CommonFileParams{
  user_id: number | null;
  /** mime is application/octet-stream if omitted */
  mime ?:string;
}

export interface GetFileParams extends CommonFileParams{
  /**Also return deleted files */
  archive ?:boolean;
  generation ?:number;
  /**SELECT FOR UPDATE, use only within a transaction. Might solve some transaction serialization troubles */
  lock?: boolean;
}

export interface GetFileRangeParams extends GetFileParams{
  /**Also return deleted files */
  start ?: number;
  end ?: number;
}

export interface WriteDirParams extends WriteFileParams{
  mime?:"text/directory";
}

export interface WriteDocParams extends WriteFileParams{
  data :string;
}

export interface ItemProps{
  ctime :Date;
  mtime :Date;
  author_id :number | null;
  author :string;
  id :number;
  name :string;
}


/** any item stored in a scene, with a name that identifies it */
export interface ItemEntry extends ItemProps{
  generation :number;
  size :number;
  mime :string;
}

/**
 * Like `ItemEntry` but `mtime` is omitted because it doesn't make any sense in history context
 */
export type HistoryEntry = Pick<ItemEntry, "name"|"mime"|"id"|"generation"|"ctime"|"author_id"|"author"|"size">;

export interface FileProps extends ItemEntry{
  /**sha254 base64 encoded string or null for deleted files */
  hash :string|null;
  /**data might be returned as a string */
  data?: string;
}

export interface GetFileResult extends FileProps{
  stream ?:Readable;
}


const SceneTypes = [
  null,
  "html",
  "voyager"
] as const;
export type SceneType = typeof SceneTypes[number];


export interface Scene extends ItemProps{
  /** optional name of the scene's thumbnail. Will generally be null due to sql types */
  thumb ?:string|null;
  /** Freeform list of attached tags for this collection */
  tags :string[];
  /** Access level. Only makes sense when in reference to a user ID */
  access : AccessType;
  public_access: AccessType;
  default_access : AccessType;
  archived: Date|null;
  type: SceneType;
}

export interface SceneMeta{
  titles?:Dictionary<string>;
  intros?:Dictionary<string>;
  copyright?:string;
  articles?: {uris: Dictionary<string>, leads: Dictionary<string>, titles: Dictionary<string>}[];
  annotations?: {titles: Dictionary<string>, leads: Dictionary<string>};
  tours?: {titles: Dictionary<string>, leads: Dictionary<string>};
  languages?:string[];
  primary_language?: string;
  primary_title?: string;
  primary_intro?: string;
}

export interface DocProps extends FileProps{
  data: string;
}

/**
 * Query structure to filter scene results.
 * Any unspecified value means "return everything"
 */
export interface SceneQuery {
  /** desired scene access level */
  access ?:AccessType;
  author ?:string;
  match ?:string;
  offset ?:number;
  limit ?:number;
  orderBy ?:"ctime"|"mtime"|"name"|"rank";
  orderDirection ?:"asc"|"desc";
  /**
   * Returns all scenes when unset.
   * When `true`, return only archived scenes.
   */
  archived ?:boolean;
}

export interface Tag{
  name :string;
  size :number;
}
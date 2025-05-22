import { Request } from "express";
import {ReadStream} from "fs";
import {Readable} from "stream";
import { AccessType } from "../auth/UserManager.js";


export type DataStream = Readable|ReadStream|AsyncGenerator<Buffer|Uint8Array>|Request;


export interface CommonFileParams{
  /** Scene name or scene id */
  scene :string|number;
  name  :string;
}

export interface WriteFileParams extends CommonFileParams{
  user_id: number;
  /** mime is application/octet-stream if omitted */
  mime ?:string;
}

export interface GetFileParams extends CommonFileParams{
  /**Also return deleted files */
  archive ?:boolean;
  generation ?:number;
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
  author_id :number;
  author :string;
  id :number;
  name :string;
}

export type Stored<T extends ItemProps> = Omit<T, "mtime"|"ctime"> & {mtime:string, ctime: string};

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



export interface Scene extends ItemProps{
  /** optional name of the scene's thumbnail. Will generally be null due to sql types */
  thumb ?:string|null;
  /** Freeform list of attached tags for this collection */
  tags :string[];
  /** Access level. Only makes sense when in reference to a user ID */
  access :{
    user ?:AccessType,
    any :AccessType,
    default :AccessType,
  };
  archived: boolean;
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
  access ?:AccessType[];
  author ?:number;
  match ?:string;
  offset ?:number;
  limit ?:number;
  orderBy ?:"ctime"|"mtime"|"name";
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
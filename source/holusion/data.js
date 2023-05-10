'use strict';
const crypto = require("crypto");
const https = require("https");
const {once} = require("events");
const fs = require("fs/promises");
const StreamZip = require("node-stream-zip");
const path = require("path");
const { createReadStream } = require("fs");
const { addAbortSignal } = require("stream");
const {forward} = require("./forward");

/** 
 * @typedef {object} InternalState
 * @property {string[]|string} [cookies]
 * @property {string|undefined} [etag]
*/

/**
 * patched ReadableStream with added properties from node-stream-zip
 * Because it doesn't expose the EntryDataReaderStream class
 * @see https://github.com/antelle/node-stream-zip/blob/7c5d50393418b261668b0dd4c8d9ccaa9ac913ce/node_stream_zip.js#L1069
 * @typedef {NodeJS.ReadableStream} ZipStream
 * @param {number} length - compressed size of entry
 */


module.exports = class DataCache{
  #lock = Promise.resolve();
  #dir;
  /** @type {StreamZip.StreamZipAsync} */
  #zip;
  /**Memoized list if scenes */
  #scenes;

  /**
   * @template T
   * @param {()=>Promise<T>} fn 
   * @returns {Promise<T>}
   */
  locked(fn){
    let callback;
    let p = this.#lock.then(fn);
    this.#lock = (()=>p.finally().then(()=>{}))();
    return p;
  }

  /**
   * @returns {Promise<InternalState>}
   */
  async getState(){
    try{
      return  Object.assign({
          cookies: "",
          etag: undefined
        },
        JSON.parse(await fs.readFile(path.join(this.#dir, "state.json"), {encoding: "utf-8"}))
      );
    }catch(e){
      if(e.code !== "ENOENT") throw e;
      return {};
    }
  }

  /**
   * Be careful with this, it's not safe to use in parallel with itself or getState()
   * @param {Partial<InternalState>} value 
   */
  async setState(value){
    await this.locked(async ()=>{
      let tmpfile = this.mktemp("state.json")
      await fs.writeFile(tmpfile,JSON.stringify({...(await this.getState()), ...value}, null, 2)+"\n");
      await fs.rename(tmpfile, path.join(this.#dir, "state.json"));
    });
  }

  /**
   * generate a unique(ish) file name in the cache directory 
   */
  mktemp(name="scenes.zip"){
    return path.join(this.#dir, `~${crypto.randomBytes(3).toString("hex")}-${name}`);
  }

  get file(){
    return path.join(this.#dir, "scenes.zip");
  }

  constructor(dir){
    this.#dir = dir;
  }

  static async Open(dir){
    await fs.mkdir(dir, {recursive: true});
    let dc = new DataCache(dir);
    await dc.getState();
    return dc;
  }

  async close(){
    try{
      await this.#zip?.close();
    }catch(e){
      if(e.code !== "ENOENT") throw e;
    }
    this.#zip = null;
  }

  async openFile(force = false){
    if(!force && this.#zip) return this.#zip;
    await this.close();
    this.#scenes = null; //Trash cached scenes
    let zip = this.#zip = new StreamZip.async({file: this.file});
    await zip.entriesCount; //Ensure zip opened and parsed properly
    return zip;
  }

  /**
   * two-stage copy a file that probably isn't on the same disk
   * @param {string} sourceFile path to a file to copy
   * @return {Promise<void>}
   */
  async copy(sourceFile){
    let tmpfile = this.mktemp();
    let src = createReadStream(sourceFile);
    let handle = await fs.open(tmpfile, "w");
    try{
      for await (let data of src){
        await handle.write(data);
      }
    }finally{
      await handle.close().catch(e=>console.warn("Failed to close tmp file handle :", e));
    }
    await this.rename(tmpfile);
  }

  /**
   * rename a file (requires to be on the same disk)
   * @param {string} tmpfile path to a file to copy
   * @param {string|undefined} [etag=undefined]
   * @return {Promise<void>}
   */
  async rename(tmpfile, etag = undefined){
    await fs.rename(tmpfile, this.file);
    await this.openFile(true);
    console.log(`scenes data zip saved to: ${this.file} ${(etag? `[${etag}]`:"")}`);
    await this.setState({etag});
  }

  /**
   * get a readable stream for the entry name
   * @param {string} filepath 
   * @return {Promise<ZipStream>}
   */
  async get(filepath){
    let zip = await this.openFile();
    return await zip.stream(filepath);
  }

  async entries(){
    let zip = await this.openFile();
    let entries = await zip.entries();
    return entries;
  }

  async getScenes(){
    return this.#scenes ??= await (async ()=>{
      let entries = await this.entries();
      let scenes = {};
      for(let filepath of Object.keys(entries)){
        let m = /^scenes(?:\/([^\/]+))/.exec(filepath);
        if(!m) continue;
        let scene = scenes[m[1]] ??= {
          root: `scenes/${m[1]}/`,
          name: m[1],
          title: m[1],
          thumb: "/images/defaultSprite.svg",
        };
    
        if(filepath.endsWith("-image-thumb.jpg")){
          scene["thumb"] = filepath;
        }else if(filepath.endsWith(".svx.json")){
          let rs = await this.get(filepath);
          rs.setEncoding("utf-8");
          let data = "";
          for await (let d of rs){
            data += d;
          }
          try{
            let document = JSON.parse(data);
            let setupIndex = document.scenes[document.scene].setup;
            let setup = document.setups[setupIndex];
            let language = setup.language?.language ?? "FR";
            for(let meta of document.metas){
              if(!meta.collection?.titles) continue;
              if( meta.collection.titles[language]) scene.title = meta.collection.titles[language];
              else if (meta.collection.titles["EN"] && scene.title == scene.name) scene.title =  meta.collection.titles["EN"];
            }
          }catch(e){
            console.error("Parse error for document \"%s\" :", filepath, e.message);
          }
        }
      }
      return scenes;
    })();
  }
}
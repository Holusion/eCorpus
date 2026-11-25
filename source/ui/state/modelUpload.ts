import {
  createUpload, deleteUpload, deleteUploadFile, FileInspection, makeUploadDerivatives, normalizePath,
  processUpload, sendFile, UploadDerivative, UploadEntry,
} from "./uploads";

/**
 * A model's upload that follows a list of files as it's edited: Voyager Story's import menu (see composants/StoryImportMenu.ts).
 *
 * The upload starts right away. Every file of the list is sent as soon as it's in it, and removed from the upload
 * when it's taken out of it, until the model is imported: the server's inspection of each model's file
 * (see {@link FileInspection}) tells which files it refers to, so what's missing is known before importing.
 *
 * Files the model doesn't seem to refer to are sent anyway: the inspection may be wrong. They're only flagged.
 * Other models in the list aren't sent: only one model is imported at a time.
 */

/** Files the server inspects: those that may refer to others (see the server's inspectModelFile) */
const inspected = [".obj", ".mtl", ".ply", ".gltf", ".glb"];
function isInspected(path: string){
  return inspected.some(ext=>path.toLowerCase().endsWith(ext));
}

/** A file of the list, as the import sees it */
export interface ListedFile{
  /** Relative to the model's folder, with `/` separators */
  path: string;
  /**
   * - `main`: the model
   * - `file`: a file that goes with it
   * - `missing`: a file the model refers to, that's not in the list. `paths` are where it's looked for, in order
   * - `model`: another model, that won't be sent
   */
  role: "main" | "file" | "missing" | "model";
  /** Where the file looked for is, in order: the first that's in the list is used. Only for `missing` */
  paths?: string[];
  /** How the sending goes. None for files that aren't sent */
  transfer?: {status: "waiting"} | {status: "sending", loaded: number, total: number} | {status: "sent"};
  /** The model doesn't seem to refer to it. Only known once each file that refers to others is inspected */
  unused?: boolean;
  /** Why it can't be converted, as the server tells */
  error?: string;
}

/** What the inspections tell of the list */
interface Resolution{
  /** Paths of the files the model refers to, directly or not, in the order they were found. Without the model */
  referenced: string[];
  /** Files the model refers to that aren't in the list, by where they're looked for */
  missing: string[][];
  /** Why files can't be converted, by path */
  rejected: Map<string, string>;
  /** Whether each file that's referenced and may refer to others was inspected: until then, more may be referenced, or missing */
  complete: boolean;
}

export interface ModelUploadOptions{
  /** Scene the derivatives are made into */
  scene: string;
  /** Whether a path is a model's: other models aren't sent */
  isModel: (path: string)=>boolean;
}

export class ModelUploadSession extends EventTarget{
  readonly main: UploadEntry;
  readonly #scene: string;
  readonly #isModel: (path: string)=>boolean;
  /** The other files of the list, by path */
  readonly #files = new Map<string, File>();
  /** Files that are in the upload, with what the server told of them */
  readonly #sent = new Map<string, {file: File, inspection?: FileInspection}>();
  #sending: {path: string, file: File, loaded: number} | null = null;
  #id: Promise<number> | null = null;
  readonly #controller = new AbortController();
  #running: Promise<void> | null = null;
  #dirty = false;
  #processed = false;
  #done = false;
  /** Why the files couldn't be sent, last time it was tried. Editing the list, or importing, tries again */
  error: Error | null = null;

  constructor(main: UploadEntry, files: Iterable<UploadEntry>, {scene, isModel}: ModelUploadOptions){
    super();
    this.main = {path: normalizePath(main.path), file: main.file};
    this.#scene = scene;
    this.#isModel = isModel;
    for(const {path, file} of files){
      const p = normalizePath(path);
      if(p && p !== this.main.path) this.#files.set(p, file);
    }
    this.sync();
  }

  get signal(){
    return this.#controller.signal;
  }

  /** Whether files are being sent or removed */
  get busy(){
    return this.#running !== null;
  }

  /** Once the model is processed, the list can't change anymore */
  get sealed(){
    return this.#processed;
  }

  /** Bytes sent of the file that's being sent, and of those that are, out of every file to send */
  get progress(): {loaded: number, total: number}{
    let loaded = 0, total = 0;
    for(const [path, file] of this.#sendable()){
      total += file.size;
      if(this.#isSent(path)) loaded += file.size;
      else if(this.#sending?.path === path && this.#sending.file === file) loaded += this.#sending.loaded;
    }
    return {loaded, total};
  }

  /** The model, then the other files, then those that are missing */
  list(): ListedFile[]{
    const resolution = this.#resolve();
    const referenced = new Set(resolution.referenced);
    const transfer = (path: string, file: File): ListedFile["transfer"] => {
      if(this.#isSent(path)) return {status: "sent"};
      if(this.#sending?.path === path && this.#sending.file === file) return {status: "sending", loaded: this.#sending.loaded, total: file.size};
      return {status: "waiting"};
    };
    // Only when the model's inspection says what it refers to: otherwise, nothing is known
    const mainInspection = this.#sent.get(this.main.path)?.inspection;
    const knowsReferences = resolution.complete && !!mainInspection && "requires" in mainInspection;

    const files: ListedFile[] = [{
      path: this.main.path,
      role: "main",
      transfer: transfer(this.main.path, this.main.file),
      error: resolution.rejected.get(this.main.path),
    }];
    for(const path of Array.from(this.#files.keys()).sort()){
      const file = this.#files.get(path)!;
      if(this.#isModel(path)){
        files.push({path, role: "model"});
        continue;
      }
      files.push({
        path,
        role: "file",
        transfer: transfer(path, file),
        unused: knowsReferences && !referenced.has(path),
        error: resolution.rejected.get(path),
      });
    }
    for(const paths of resolution.missing){
      files.push({path: paths[0], role: "missing", paths});
    }
    return files;
  }

  /** Why the model can't be imported as the list is: files missing, and why files can't be converted. Both empty when it can be */
  get problem(): {missing: string[][], rejected: string[]}{
    const {missing, rejected} = this.#resolve();
    return {missing, rejected: Array.from(rejected.values())};
  }

  /**
   * Whether the files look right: the model and every file it refers to that may refer to others were inspected,
   * and nothing is missing or can't be converted. Files may still be being sent.
   */
  get checked(): boolean{
    const {missing, rejected, complete} = this.#resolve();
    return complete && missing.length === 0 && rejected.size === 0;
  }

  /**
   * Add files to the list, by path relative to the model's folder. One of the same path is replaced.
   * A file that's not in a folder and isn't referenced, but has the name of a missing one, takes its place:
   * a file picker gives no folders.
   * @returns the paths they were added at
   */
  add(entries: Iterable<UploadEntry>): string[]{
    if(this.#processed) return [];
    const missing = this.#resolve().missing.flat();
    const added: string[] = [];
    for(const {path, file} of entries){
      let p = normalizePath(path);
      if(!p || p === this.main.path) continue;
      if(!p.includes("/") && !missing.includes(p)){
        p = missing.find(m=>m.split("/").pop() === p && !this.#files.has(m)) ?? p;
      }
      this.#files.set(p, file);
      added.push(p);
    }
    this.#changed();
    this.sync();
    return added;
  }

  /** Take a file out of the list: it's removed from the upload if it was sent */
  remove(path: string){
    if(this.#processed || !this.#files.delete(path)) return;
    this.#changed();
    this.sync();
  }

  /**
   * Bring the upload in line with the list: remove what's no longer in it, send what's not sent yet.
   * Resolves once it's done, or failed: see {@link error}. Never rejects.
   */
  sync(): Promise<void>{
    if(this.#running){
      this.#dirty = true;
      return this.#running;
    }
    this.error = null;
    this.#running = (async ()=>{
      do{
        this.#dirty = false;
        await this.#run();
      }while(this.#dirty && !this.error && !this.signal.aborted);
    })().finally(()=>{
      this.#running = null;
      this.#changed();
    });
    this.#changed();
    return this.#running;
  }

  /**
   * Import the model: once every file is sent, process the upload and make each quality into the scene.
   * Can be tried again when it fails, but the list can't change anymore once the model is processed.
   * @returns the derivatives, lowest first
   */
  async importModel({qualities, optimize}: {qualities: string[], optimize: boolean}): Promise<UploadDerivative[]>{
    const signal = this.signal;
    const id = await this.#uploadId();
    if(!this.#processed){
      await this.sync();
      if(this.error) throw this.error;
      const {missing, rejected} = this.#resolve();
      if(rejected.size) throw new Error(rejected.values().next().value);
      if(missing.length) throw new Error(`Missing files: ${missing.map(paths=>paths[0]).join(", ")}`);
      await processUpload(id, this.main.path, {signal});
      this.#processed = true;
      this.#changed();
    }
    const derivatives = await makeUploadDerivatives(id, {usage: "Web3D", qualities, optimize}, {signal});
    this.#done = true;
    return derivatives;
  }

  /** Abandon the upload, unless the model was imported: its data is removed from the server */
  close(){
    this.#controller.abort();
    if(this.#done || !this.#id) return;
    this.#id.then(id=>deleteUpload(id), ()=>{});
  }

  ////////////////////////////////////////////////////////////////////////////

  #changed(){
    this.dispatchEvent(new Event("change"));
  }

  #fileAt(path: string): File | undefined{
    return path === this.main.path ? this.main.file : this.#files.get(path);
  }

  /** Whether the file of the list at `path` is in the upload, as it is */
  #isSent(path: string){
    const sent = this.#sent.get(path);
    return !!sent && sent.file === this.#fileAt(path);
  }

  /** Files that are to be in the upload: the model, and the others that aren't models */
  #sendable(): Array<[string, File]>{
    return [
      [this.main.path, this.main.file],
      ...Array.from(this.#files).filter(([path])=>!this.#isModel(path)),
    ];
  }

  /**
   * Follow the inspections from the model: each file it refers to is found at the first of its paths that's in the list,
   * then followed in turn. A model the server couldn't inspect may refer to any file.
   */
  #resolve(): Resolution{
    const inList = (p: string)=> p === this.main.path || (this.#files.has(p) && !this.#isModel(p));
    const referenced: string[] = [];
    const missing: string[][] = [];
    const rejected = new Map<string, string>();
    let complete = true;
    const queue = [this.main.path];
    for(let i = 0; i < queue.length; i++){
      const path = queue[i];
      if(!this.#isSent(path)){
        if(path === this.main.path || isInspected(path)) complete = false;
        continue;
      }
      const inspection = this.#sent.get(path)!.inspection;
      if(!inspection) continue;
      if("error" in inspection){
        rejected.set(path, inspection.error);
        continue;
      }
      for(const paths of inspection.requires){
        const found = paths.find(inList);
        if(!found){
          if(!missing.some(m=>m[0] === paths[0])) missing.push(paths);
        }else if(!queue.includes(found)){
          queue.push(found);
          referenced.push(found);
        }
      }
    }
    return {referenced, missing, rejected, complete};
  }

  #uploadId(): Promise<number>{
    return this.#id ??= createUpload({scene: this.#scene}, {signal: this.signal}).catch(e=>{
      this.#id = null;
      throw e;
    });
  }

  /** Remove what's no longer in the list, then send the files that aren't sent, those that are referenced first */
  async #run(){
    const signal = this.signal;
    try{
      const id = await this.#uploadId();
      for(;;){
        if(this.#processed) return;
        const gone = Array.from(this.#sent.keys()).find(path=>!this.#sendable().some(([p])=>p === path));
        if(gone){
          await deleteUploadFile(id, gone, {signal});
          this.#sent.delete(gone);
          this.#changed();
          continue;
        }
        const sendable = new Map(this.#sendable());
        const order = [this.main.path, ...this.#resolve().referenced, ...sendable.keys()];
        const path = order.find(p=>sendable.has(p) && !this.#isSent(p));
        if(!path) return;
        const file = sendable.get(path)!;
        this.#sending = {path, file, loaded: 0};
        this.#changed();
        try{
          const {inspection} = await sendFile(id, {path, file}, {signal, onProgress: (loaded)=>{
            if(this.#sending?.file !== file) return;
            this.#sending.loaded = loaded;
            this.#changed();
          }});
          this.#sent.set(path, {file, inspection});
        }finally{
          this.#sending = null;
        }
        this.#changed();
      }
    }catch(e: any){
      if(signal.aborted) return;
      console.error("Model upload failed:", e);
      this.error = e instanceof Error ? e : new Error(String(e));
    }
  }
}

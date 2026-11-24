import { css, html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";

import strings, { Language, LocalizedString } from "../state/strings";
import { Localization } from "../state/translate";
import { ListedFile, ModelUploadSession } from "../state/modelUpload";
import { normalizePath, readDroppedFiles, UploadEntry } from "../state/uploads";
import { ImportPlan, isHdr, isImage, isModel, planImport, putSceneFile } from "../state/sceneImport";

/** A model of the scene the import may go to (Voyager's IImportTarget) */
export interface ImportTarget{
  id: string;
  name: string;
  qualities: string[];
}

/** What to do with the imported files (Voyager's IFileImportResult) */
export type ImportResult =
  | {kind: "model", target: string | null, name: string, derivatives: Array<{quality: string, uri: string}>}
  | {kind: "environment", uri: string}
  | {kind: "overlay", target: string, uri: string}
  | {kind: "plane", uri: string}
  /** Files for the scene to use later: nothing more to do */
  | null;

export interface ImportMenuOptions{
  /** Scene the files are imported into */
  scene: string;
  /** The files to import, by path among them. More can be added in the menu */
  files: Map<string, File>;
  /** The scene's models */
  models: ImportTarget[];
  lang?: string;
}

/** What can be done with the files, as the plan allows */
type Choice = "new" | "existing" | "environment" | "overlay" | "plane" | "files";

/** Every quality, in the order they're listed */
const allQualities = ["Thumb", "Low", "Medium", "High", "Highest", "AR"];
/** Qualities from lowest to highest, as Voyager picks derivatives */
const qualityRanks = ["Thumb", "AR", "Low", "Medium", "High", "Highest"];
/** Selected by default: a quick one to show first, and the one to keep */
const defaultQualities = ["Thumb", "High"];

function basename(path: string){
  return path.slice(path.lastIndexOf("/") + 1);
}

/**
 * Voyager Story's import menu, for its `import-files` event (see handlers/story.ts): the scene's gateway for files.
 * It goes in steps:
 * 1. The files, that can be removed, or added with a picker or by dropping them anywhere in the page while the menu is open.
 *    What they're for is guessed from them (see {@link planImport}). A model's files are sent right away, and checked:
 *    the menu tells what's missing, what doesn't seem to be used, other models and files out of the model's folder.
 * 2. Once the files look right, what to do with them, chosen deliberately:
 *    a new model or an existing one's for a model; an environment map, an overlay map, an image plane or a scene file for an image.
 * 3. That choice's options: the model's name or the model it goes to, qualities and whether to optimize them.
 */
@customElement("story-import-menu")
export default class StoryImportMenu extends LitElement{
  scene: string;
  models: ImportTarget[] = [];
  lang: Language = "en";

  /** The files, by path among them */
  @state() entries = new Map<string, File>();
  /** A model's upload, while the files are a model's */
  session: ModelUploadSession | null = null;
  /** Its model's path among the files, and the folder it's in */
  #sessionPlan: {main: string, prefix: string} | null = null;

  @state() choice: Choice | null = null;
  /** The new model's name: its file's base name, until it's changed */
  @state() newName = "";
  #nameEdited = false;
  @state() chosen: ImportTarget | null = null;
  @state() modelListExpanded = true;
  @state() qualities: string[] = defaultQualities.slice();
  @state() optimize = true;
  @state() importing: "upload" | "process" | null = null;
  @state() error = "";
  @state() dragging = false;
  /** The explanation shown for an indicator that was clicked, and where */
  @state() note: {key: string, text: string, top: number, left: number} | null = null;

  #controller = new AbortController();
  #resolve: (r: ImportResult)=>void;
  #reject: (e: any)=>void;

  /** Resolves with what was imported, rejects with an AbortError when the menu is closed */
  static show(parent: HTMLElement, {scene, files, models, lang}: ImportMenuOptions): Promise<ImportResult>{
    const menu = new StoryImportMenu();
    menu.scene = scene;
    menu.models = models;
    menu.lang = (["en", "fr"].includes(lang?.toLowerCase()) ? lang.toLowerCase() : Localization.Instance.language) as Language;
    const done = new Promise<ImportResult>((resolve, reject)=>{
      menu.#resolve = resolve;
      menu.#reject = reject;
    });
    menu.setFiles(new Map(Array.from(files, ([path, file])=>[normalizePath(path) || file.name, file])));
    parent.appendChild(menu);
    return done;
  }

  constructor(){
    super();
    this.onSessionChange = this.onSessionChange.bind(this);
    this.onWindowDragOver = this.onWindowDragOver.bind(this);
    this.onWindowDragLeave = this.onWindowDragLeave.bind(this);
    this.onWindowDrop = this.onWindowDrop.bind(this);
  }

  t(key: keyof typeof strings.storyImport, params: Record<string, string|number> = {}): string{
    const s = strings.storyImport[key] as LocalizedString;
    return Localization.Instance.interpolate(s[this.lang] ?? s.en, params);
  }

  get plan(): ImportPlan{
    return planImport(this.entries.keys());
  }

  /** Whether the files look right, so that what to do with them can be chosen */
  get checked(): boolean{
    const plan = this.plan;
    if(plan.kind === "model") return !!this.session?.checked && !this.session.error;
    return plan.kind !== "none";
  }

  /** Whether the files can still change */
  get editable(){
    return !this.importing && !this.session?.sealed;
  }

  connectedCallback(){
    super.connectedCallback();
    // Captured before Voyager's drop zone gets them: they go with these files
    window.addEventListener("dragover", this.onWindowDragOver, {capture: true});
    window.addEventListener("dragleave", this.onWindowDragLeave, {capture: true});
    window.addEventListener("drop", this.onWindowDrop, {capture: true});
  }

  disconnectedCallback(){
    super.disconnectedCallback();
    window.removeEventListener("dragover", this.onWindowDragOver, {capture: true});
    window.removeEventListener("dragleave", this.onWindowDragLeave, {capture: true});
    window.removeEventListener("drop", this.onWindowDrop, {capture: true});
  }

  protected firstUpdated(){
    this.renderRoot.querySelector<HTMLElement>("[role=dialog]")?.focus();
    // The note would stay where its indicator was
    this.renderRoot.addEventListener("scroll", ()=>this.note = null, {capture: true});
  }

  close(){
    this.#controller.abort();
    this.session?.close();
    this.remove();
    this.#reject(new DOMException("The import menu was closed", "AbortError"));
  }

  ////////////////////////////////////////////////////////////////////////////
  // Files

  /**
   * Set the list of files, then follow what it's guessed to be for:
   * a model's files get an upload, started anew when the model changes. The choice goes when the guess changes.
   */
  setFiles(entries: Map<string, File>){
    const before = this.plan.kind;
    this.entries = entries;
    const plan = this.plan;
    //A new model by default. Other files' use is the user's to choose
    if(plan.kind !== before) this.choice = plan.kind === "model" ? "new" : null;

    if(plan.kind === "model"){
      if(this.#sessionPlan?.main !== plan.main){
        this.#closeSession();
        const inside = Array.from(entries)
        .filter(([path])=>path !== plan.main && path.startsWith(plan.prefix))
        .map(([path, file])=>({path: path.slice(plan.prefix.length), file}));
        this.session = new ModelUploadSession({path: basename(plan.main), file: entries.get(plan.main)}, inside, {scene: this.scene, isModel});
        this.session.addEventListener("change", this.onSessionChange);
        this.#sessionPlan = {main: plan.main, prefix: plan.prefix};
        if(!this.#nameEdited) this.newName = this.baseName;
      }
    }else{
      this.#closeSession();
    }
  }

  #closeSession(){
    if(!this.session) return;
    this.session.removeEventListener("change", this.onSessionChange);
    this.session.close();
    this.session = null;
    this.#sessionPlan = null;
  }

  /** The model's file name, without its extension */
  get baseName(){
    const main = this.#sessionPlan?.main;
    return (main && basename(main).replace(/\.[^.]*$/, "")) || "Model";
  }

  /** Add files: those of a model's upload go in its model's folder */
  addFiles(files: UploadEntry[]){
    if(!this.editable) return;
    const entries = new Map(this.entries);
    for(const {path, file} of files){
      const p = normalizePath(path) || file.name;
      const plan = this.#sessionPlan;
      if(plan && this.session){
        // Where the upload put it. Other models are listed by it too: they're flagged, and not sent
        const [added] = this.session.add([{path: p, file}]);
        if(added) entries.set(plan.prefix + added, file);
      }else{
        entries.set(plan ? plan.prefix + p : p, file);
      }
    }
    this.setFiles(entries);
  }

  /** Take a file out, by path among the files */
  removeFile(path: string){
    if(!this.editable) return;
    const plan = this.#sessionPlan;
    if(plan && path !== plan.main && path.startsWith(plan.prefix)){
      this.session?.remove(path.slice(plan.prefix.length));
    }
    const entries = new Map(this.entries);
    entries.delete(path);
    this.setFiles(entries);
  }

  ////////////////////////////////////////////////////////////////////////////
  // Import

  async confirm(){
    if(this.importing) return;
    const plan = this.plan;
    const choice = plan.kind === "files" ? "files" : this.choice;
    if(!choice){
      this.error = this.t("selectChoice");
    }else if((choice === "existing" || choice === "overlay") && !this.chosen){
      this.error = this.t("selectModel");
    }else if((choice === "new" || choice === "existing") && this.qualities.length === 0){
      this.error = this.t("selectQuality");
    }else{
      this.error = "";
      try{
        const result = await this.#import(plan, choice);
        this.session = null;
        this.remove();
        this.#resolve(result);
      }catch(e: any){
        if(this.#controller.signal.aborted) return;
        console.error("Import failed:", e);
        this.error = e?.message || this.t("uploadFailed");
      }finally{
        this.importing = null;
      }
    }
  }

  async #import(plan: ImportPlan, choice: Choice): Promise<ImportResult>{
    const signal = this.#controller.signal;
    if(plan.kind === "model"){
      const session = this.session;
      this.importing = session.sealed ? "process" : "upload";
      if(!session.sealed){
        //Once every file is sent, what's missing is known
        await session.sync();
        if(session.error) throw session.error;
        const {missing, rejected} = session.problem;
        if(rejected.length) throw new Error(rejected[0]);
        if(missing.length) throw new Error(this.t("missingHint"));
      }
      const qualities = allQualities.filter(q=>this.qualities.includes(q))
      .sort((a, b)=>qualityRanks.indexOf(a) - qualityRanks.indexOf(b));
      const derivatives = await session.importModel({qualities, optimize: this.optimize});
      return {
        kind: "model",
        target: choice === "existing" ? this.chosen.id : null,
        name: this.newName,
        //Voyager shows the last one
        derivatives: derivatives.map(({quality, uri})=>({quality, uri}))
        .sort((a, b)=>qualityRanks.indexOf(a.quality) - qualityRanks.indexOf(b.quality)),
      };
    }

    this.importing = "upload";
    if(plan.kind === "image" && choice !== "files"){
      const file = this.entries.get(plan.image);
      // Where Voyager puts them: environment maps with articles' images, overlays and planes at the root
      const uri = await putSceneFile(this.scene, (choice === "environment" ? "articles/" : "") + basename(plan.image), file, {signal});
      if(choice === "overlay") return {kind: "overlay", target: this.chosen.id, uri};
      return {kind: choice as "environment" | "plane", uri};
    }
    for(const [path, file] of this.entries){
      await putSceneFile(this.scene, isImage(path) ? `articles/${basename(path)}` : path, file, {signal});
    }
    return null;
  }

  ////////////////////////////////////////////////////////////////////////////
  // Events

  private onSessionChange(){
    if(this.importing === "upload" && this.session && !this.session.busy) this.importing = "process";
    this.requestUpdate();
  }

  private onKeyDown(e: KeyboardEvent){
    if(e.key === "Escape"){
      e.stopPropagation();
      if(this.note) this.note = null;
      else this.close();
    }
  }

  /** Show what an indicator means under it, or hide it if it's shown already */
  private onClickIndicator(e: MouseEvent, key: string, text: string){
    e.stopPropagation();
    if(this.note?.key === key){
      this.note = null;
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.note = {key, text, top: rect.bottom + 4, left: rect.right};
  }

  private onTabKeyDown(e: KeyboardEvent){
    if(e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = this.choice === "new" ? "existing" : "new";
    if(next === "existing" && this.models.length === 0) return;
    this.onChoose(next);
    this.updateComplete.then(()=>this.renderRoot.querySelector<HTMLElement>(`#tab-${next}`)?.focus());
  }

  private onChoose(choice: Choice){
    if(this.importing) return;
    this.choice = choice;
    this.error = "";
  }

  /** The name typed is kept: an empty one is the file's base name again */
  private onNameChange(e: Event){
    const input = e.target as HTMLInputElement;
    const name = input.value.trim();
    this.#nameEdited = !!name;
    this.newName = name || this.baseName;
    input.value = this.newName;
  }

  private onClickModel(model: ImportTarget){
    if(this.importing) return;
    this.chosen = model;
    this.modelListExpanded = false;
    this.error = "";
  }

  private onClickQuality(e: Event, quality: string){
    e.preventDefault();
    if(this.importing) return;
    this.qualities = this.qualities.includes(quality) ? this.qualities.filter(q=>q !== quality) : [...this.qualities, quality];
  }

  private onPickFiles(e: Event){
    const input = e.target as HTMLInputElement;
    this.addFiles(Array.from(input.files ?? [], file=>({path: file.name, file})));
    input.value = "";
  }

  private onWindowDragOver(e: DragEvent){
    if(!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = this.editable ? "copy" : "none";
    this.dragging = this.editable;
  }

  private onWindowDragLeave(e: DragEvent){
    // Out of the window
    if(e.relatedTarget === null) this.dragging = false;
  }

  private onWindowDrop(e: DragEvent){
    if(!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    e.stopPropagation();
    this.dragging = false;
    if(!this.editable) return;
    readDroppedFiles(e.dataTransfer).then(files=>this.addFiles(files), error=>{
      console.error("Failed to read dropped files:", error);
    });
  }

  ////////////////////////////////////////////////////////////////////////////
  // Rendering

  private renderRemove(path: string){
    if(!this.editable) return nothing;
    const label = this.t("remove", {path});
    return html`<button type="button" class="remove" title=${label} aria-label=${label} @click=${()=>this.removeFile(path)}>✕</button>`;
  }

  /** A file's path, cut short by an ellipsis in its middle when it's too long: its extension stays visible */
  private renderFileName(path: string){
    const dot = path.lastIndexOf(".");
    const cut = dot > path.lastIndexOf("/") + 1 ? dot : path.length;
    return html`<span class="file-name" title=${path}><span class="stem">${path.slice(0, cut)}</span><span class="ext">${path.slice(cut)}</span></span>`;
  }

  /** A file's warning, or error: clicking it tells what it means */
  private renderIndicator(path: string, level: "warning" | "error", label: string, text: string){
    const key = `${path}\n${label}`;
    return html`<button type="button" class=${"tag indicator " + level} aria-expanded=${this.note?.key === key ? "true" : "false"} aria-controls="note"
      @click=${(e: MouseEvent)=>this.onClickIndicator(e, key, text)}>${label}</button>`;
  }

  /** A row of a model's file, by path relative to its folder */
  private renderModelFile(f: ListedFile, prefix: string){
    let tag = null, warning = null, status = null;
    //Voyager's icon for models, as in its Navigator: <ff-icon> is defined on Story's page
    if(f.role === "main") tag = html`<span class="tag model-icon" title=${this.t("model")}><ff-icon name="cube" aria-hidden="true"></ff-icon><span class="sr-only">${this.t("model")}</span></span>`;
    else if(f.role === "missing") warning = this.renderIndicator(f.path, "error", this.t("missing"), this.t("missingHint"));
    else if(f.role === "model") warning = this.renderIndicator(f.path, "warning", this.t("otherModel"), this.t("otherModelHint"));
    else if(f.unused) warning = this.renderIndicator(f.path, "warning", this.t("unused"), this.t("unusedHint"));
    if(f.transfer?.status === "sending"){
      status = this.t("sending", {percent: f.transfer.total ? Math.floor(100 * f.transfer.loaded / f.transfer.total) : 0});
    }else if(f.transfer?.status === "sent"){
      status = this.t("sent");
    }else if(f.transfer?.status === "waiting"){
      status = this.t("waiting");
    }
    return html`<li class=${f.role}>
      <div class="row">
        ${this.renderFileName(f.path)}
        ${tag}${warning}
        ${status ? html`<span class="status">${status}</span>` : nothing}
        ${f.role === "missing" ? nothing : this.renderRemove(prefix + f.path)}
      </div>
      ${f.error ? html`<div class="file-error">${f.error}</div>` : nothing}
    </li>`;
  }

  private renderFiles(){
    const plan = this.plan;
    const rows = [];
    const hints = [];
    if(plan.kind === "model" && this.session){
      const files = this.session.list();
      rows.push(...files.map(f=>this.renderModelFile(f, plan.prefix)));
      const outside = Array.from(this.entries.keys()).filter(path=>!path.startsWith(plan.prefix)).sort();
      rows.push(...outside.map(path=>html`<li class="outside"><div class="row">
        ${this.renderFileName(path)}
        ${this.renderIndicator(path, "warning", this.t("outside"), this.t("outsideHint"))}
        ${this.renderRemove(path)}
      </div></li>`));
      if(this.session.error && !this.importing) hints.push(html`<div class="hint error">${this.session.error.message || this.t("uploadFailed")}</div>`);
    }else{
      for(const path of Array.from(this.entries.keys()).sort()){
        rows.push(html`<li><div class="row">
          ${this.renderFileName(path)}
          ${isImage(path) ? html`<span class="tag">${this.t("image")}</span>` : nothing}
          ${this.renderRemove(path)}
        </div></li>`);
      }
      if(plan.kind === "files" && Array.from(this.entries.keys()).filter(isImage).length > 1){
        hints.push(html`<div class="hint warning">${this.t("severalImages")}</div>`);
      }
      if(plan.kind === "image" && isHdr(plan.image)) hints.push(html`<div class="hint">${this.t("hdrHint")}</div>`);
    }
    return html`<section class="box files" aria-label=${this.t("files")}>
      <div class="header">${this.t("files")}</div>
      ${rows.length ? html`<ul>${rows}</ul>` : html`<div class="empty">${this.t("noFiles")}</div>`}
      ${hints.length ? html`<div class="notes">${hints}</div>` : nothing}
      ${this.editable ? html`<div class="footer add-files">
        <button type="button" class="button" @click=${()=>this.renderRoot.querySelector<HTMLInputElement>("input[type=file]")?.click()}>${this.t("addFiles")}</button>
        ${rows.length ? html`<span class="hint">${this.t("dropHint")}</span>` : nothing}
        <input type="file" multiple hidden @change=${this.onPickFiles}>
      </div>` : nothing}
    </section>`;
  }

  /**
   * What to do with the files. A model's options show as soon as there's a model, as a new model by default:
   * only importing waits for its files to be right. No choice is made for the user for other files.
   */
  private renderChoices(){
    const plan = this.plan;
    if(plan.kind === "model") return this.renderModelTabs();
    if(!this.checked) return nothing;
    if(plan.kind === "files"){
      return html`<section class="box choices" aria-label=${this.t("whatToDo")}>
        <div class="header">${this.t("whatToDo")}</div>
        <div class="body"><div class="hint">${this.t("filesHint")}</div></div>
      </section>`;
    }
    const noModels = this.models.length === 0;
    const hdr = plan.kind === "image" && isHdr(plan.image);
    const choices: Array<[Choice, string, boolean]> = [
      ["environment", this.t("environment"), false],
      ["overlay", this.t("overlay"), noModels || hdr],
      ["plane", this.t("plane"), hdr],
      ["files", this.t("sceneFile"), false],
    ];
    return html`<section class="box choices" aria-label=${this.t("whatToDo")}>
      <div class="header">${this.t("whatToDo")}</div>
      <div class="body">
        <div class="options">
          ${choices.map(([choice, label, disabled])=>html`<button type="button" class="option-button"
            aria-pressed=${this.choice === choice ? "true" : "false"} ?disabled=${disabled || !!this.importing}
            @click=${()=>this.onChoose(choice)}>${label}</button>`)}
        </div>
        ${this.choice === "files" ? html`<div class="hint">${this.t("sceneFileHint")}</div>` : nothing}
      </div>
    </section>`;
  }

  /** The models of the scene, to pick one: it collapses to the one picked */
  private renderModelPicker(){
    const expanded = this.modelListExpanded || !this.chosen;
    return html`${this.chosen ? html`<button type="button" class="target-toggle" aria-expanded=${expanded ? "true" : "false"}
        @click=${()=>this.modelListExpanded = !this.modelListExpanded}>
        <span class="caret" aria-hidden="true">▸</span><b>${this.chosen.name}</b>
      </button>` : html`<div class="body"><div class="hint">${this.t("selectModel")}</div></div>`}
      ${expanded ? html`<div class="models" role="listbox" aria-label=${this.t("model")}>
        ${this.models.map(model=>html`<div class="option" role="option" aria-selected=${model === this.chosen ? "true" : "false"}
          @click=${()=>this.onClickModel(model)}>${model.name}</div>`)}
      </div>` : nothing}`;
  }

  private renderModelList(){
    return html`<section class="box target" aria-label=${this.t("model")}>
      <div class="header">${this.t("model")}</div>
      ${this.renderModelPicker()}
    </section>`;
  }

  /**
   * A model's two uses, as tabs: a new model at first.
   * The selected one's panel has the new model's name, or the model it goes to.
   */
  private renderModelTabs(){
    const tab = (choice: "new" | "existing", label: string, disabled = false)=>{
      const selected = this.choice === choice;
      return html`<button type="button" class="tab" role="tab" id=${"tab-" + choice} aria-controls="panel"
        aria-selected=${selected ? "true" : "false"} tabindex=${selected ? "0" : "-1"}
        ?disabled=${disabled || !!this.importing} @click=${()=>this.onChoose(choice)} @keydown=${this.onTabKeyDown}>${label}</button>`;
    };
    return html`<section class="box tabbed">
      <div class="tabs" role="tablist" aria-label=${this.t("whatToDo")}>
        ${tab("new", this.t("newModel"))}
        ${tab("existing", this.t("existingModel"), this.models.length === 0)}
      </div>
      ${this.choice === "new" ? html`<div class="panel" role="tabpanel" id="panel" aria-labelledby="tab-new">
        <label class="field">
          <span>${this.t("name")}</span>
          <input type="text" ?disabled=${!!this.importing} .value=${this.newName} @change=${this.onNameChange}>
        </label>
      </div>` : this.choice === "existing" ? html`<div class="panel picker" role="tabpanel" id="panel" aria-labelledby="tab-existing">
        ${this.renderModelPicker()}
      </div>` : nothing}
    </section>`;
  }

  private renderQualities(){
    const present = new Set(this.choice === "existing" ? this.chosen?.qualities ?? [] : []);
    return html`<section class="box qualities" aria-label=${this.t("qualities")}>
      <div class="header">${this.t("qualities")}</div>
      <div class="body">
      <div class="chips" role="group">
        ${allQualities.map(quality=>{
          const selected = this.qualities.includes(quality);
          const replaced = present.has(quality);
          return html`<div class=${"chip" + (replaced ? " present" : "")} role="checkbox" tabindex="0"
            aria-checked=${selected ? "true" : "false"} title=${replaced ? this.t("present") : ""}
            @click=${(e: Event)=>this.onClickQuality(e, quality)}
            @keydown=${(e: KeyboardEvent)=>(e.key === "Enter" || e.key === " ") && this.onClickQuality(e, quality)}>${quality}</div>`;
        })}
      </div>
      ${allQualities.some(q=>present.has(q)) ? html`<div class="hint legend">${this.t("present")}</div>` : nothing}
      <label class="optimize">
        <input type="checkbox" .checked=${this.optimize} ?disabled=${!!this.importing}
          @change=${(e: Event)=>this.optimize = (e.target as HTMLInputElement).checked}>
        ${this.t("optimize")}
      </label>
      ${this.optimize ? nothing : html`<div class="hint">${this.t("notOptimizedHint")}</div>`}
      </div>
    </section>`;
  }

  /** The chosen use's options */
  private renderChoiceOptions(){
    if(this.plan.kind !== "model" && !this.checked) return nothing;
    switch(this.choice){
      case "new":
      case "existing":
        return this.renderQualities();
      case "overlay":
        return this.renderModelList();
      default:
        return nothing;
    }
  }

  private renderBusy(){
    const {loaded, total} = this.session?.progress ?? {loaded: 0, total: 0};
    const measured = this.importing === "upload" && 0 < total;
    const status = this.importing === "process" ? this.t("processing")
      : this.t("uploading") + (measured ? ` ${Math.floor(100 * loaded / total)}%` : "");
    return html`<div class="busy" role="status" aria-live="polite">
      <div>${status}</div>
      ${measured ? html`<progress max=${total} .value=${loaded}></progress>` : nothing}
    </div>`;
  }

  protected render(){
    const plan = this.plan;
    const ready = plan.kind === "model" ? this.choice !== null : this.checked && (this.choice !== null || plan.kind === "files");
    //Until a model's files are right: the indicators tell why, the note says what's left
    let blocked = "";
    if(plan.kind === "model" && this.session && !this.session.sealed){
      const {missing, rejected} = this.session.problem;
      if(rejected.length) blocked = rejected[0];
      else if(missing.length) blocked = this.t("missingHint");
      else if(!this.session.checked && !this.session.error) blocked = this.t("checking");
    }
    return html`<div class="backdrop"></div>
    <div class=${"menu" + (this.dragging ? " dragging" : "")} role="dialog" aria-modal="true" aria-labelledby="title"
      tabindex="-1" @keydown=${this.onKeyDown} @click=${()=>this.note = null}>
      ${this.importing ? this.renderBusy() : nothing}
      <div class="top">
        <h2 id="title">${this.t("title")}</h2>
        <button type="button" class="close" title=${this.t("close")} aria-label=${this.t("close")} @click=${this.close}>✕</button>
      </div>
      ${this.renderFiles()}
      ${this.renderChoices()}
      ${this.renderChoiceOptions()}
      ${ready ? html`<div class="actions">
        <button type="button" class="button primary" ?disabled=${!!this.importing || !!blocked}
          aria-describedby=${blocked ? "blocked" : nothing} @click=${this.confirm}>
          ${plan.kind === "model" ? this.t("import") : this.t("importFiles")}
        </button>
        ${blocked ? html`<div class="hint" id="blocked">${blocked}</div>` : nothing}
      </div>` : nothing}
      <div class="error-msg">${this.error}</div>
      ${this.note ? html`<div class="note" id="note" role="note" style=${`top: ${this.note.top}px; left: ${this.note.left}px`}>${this.note.text}</div>` : nothing}
    </div>`;
  }

  static styles = css`
    :host{
      --primary: #0089bf;
      --warning: #ffcd00;
      --error: #ff6b6b;
      --missing: #f4a6a6;
      /* Voyager's color for models' icons */
      --model: #3dccab;
      --background: #343434;
      --background-dark: #262626;
      --background-light: #444;
      --background-lighter: #555;
      --text: #eee;
      --text-dim: #a0a0a0;
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      color: var(--text);
      font-size: 14px;
    }
    .backdrop{
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.35);
    }
    /* At a fixed distance from the top: its first lines stay where they are as lines are added */
    .menu{
      position: relative;
      box-sizing: border-box;
      width: 440px;
      max-width: calc(100vw - 32px);
      margin-top: min(12vh, 96px);
      max-height: calc(100vh - min(12vh, 96px) - 16px);
      overflow-y: auto;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      background: var(--background);
      box-shadow: 0 0 20px rgba(0, 0, 0, 0.35);
      outline: none;
    }
    /* Focused when it opens, for the keyboard: it's not a control to outline */
    .menu:focus-visible{
      outline: none;
    }
    .menu.dragging{
      outline: 2px dashed var(--primary);
      outline-offset: -4px;
    }
    button{
      font: inherit;
      color: inherit;
      cursor: pointer;
      border: none;
      background: var(--background-light);
      border-radius: 3px;
      padding: 4px 8px;
    }
    button:hover:not(:disabled){
      background: var(--background-lighter);
    }
    button:disabled{
      cursor: default;
      opacity: 0.5;
    }
    button:focus-visible, [tabindex]:focus-visible, input:focus-visible{
      outline: 2px solid var(--primary);
      outline-offset: 1px;
    }
    .top{
      display: flex;
      align-items: center;
      gap: 6px;
      position: relative;
      /* Above the busy overlay: closing the menu cancels the import */
      z-index: 2;
    }
    h2{
      flex: 1 1 auto;
      margin: 0;
      padding: 0 4px;
      font-size: 1.15em;
      font-weight: normal;
    }
    .options{
      display: flex;
      flex-wrap: wrap;
      gap: 3px;
    }
    .option-button{
      flex: 1 1 40%;
      padding: 6px 5px;
    }
    .option-button[aria-pressed="true"], .option-button[aria-pressed="true"]:hover:not(:disabled){
      background: var(--primary);
    }
    .empty{
      padding: 12px 8px;
      color: var(--text-dim);
      text-align: center;
    }
    .close, .remove{
      background: none;
      padding: 2px 6px;
    }
    /* A section: its header, then what it's about, in one box */
    .box{
      display: flex;
      flex-direction: column;
      background: var(--background-dark);
      border-radius: 3px;
      overflow: hidden;
    }
    /* Separators start and end with the text */
    .box > .header{
      display: block;
      margin: 0 8px;
      padding: 5px 0;
      font-weight: bold;
      border-bottom: 1px solid var(--background-lighter);
    }
    .box > .body{
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 6px 8px;
    }
    .box > .notes{
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin: 0 8px;
      padding: 4px 0;
      border-top: 1px solid var(--background-light);
    }
    .box > .footer{
      margin: 0 8px;
      padding: 6px 0;
      border-top: 1px solid var(--background-lighter);
    }
    .hint{
      color: var(--text-dim);
      font-size: 0.9em;
      font-style: italic;
    }
    .hint.warning{ color: var(--warning); }
    .hint.error{ color: var(--error); }
    .tabs{
      display: flex;
    }
    .tab, .tab:hover:not(:disabled){
      flex: 1 1 0;
      padding: 5px 8px;
      font-weight: bold;
      border-radius: 0;
      background: var(--background-light);
    }
    .tab:hover:not(:disabled){
      background: var(--background-lighter);
    }
    .tab[aria-selected="true"], .tab[aria-selected="true"]:hover{
      background: none;
      cursor: default;
    }
    /* Under its tab, like a box's body under its header: the separator starts and ends with the text */
    .panel{
      position: relative;
      padding: 6px 8px;
    }
    .panel::before{
      content: "";
      position: absolute;
      top: 0;
      left: 8px;
      right: 8px;
      border-top: 1px solid var(--background-lighter);
    }
    /* Its rows have their own padding */
    .panel.picker{
      padding: 0;
    }
    .field{
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .field input{
      flex: 1 1 auto;
      min-width: 0;
      box-sizing: border-box;
      padding: 4px 6px;
      font: inherit;
      color: inherit;
      background: var(--background);
      border: 1px solid var(--background-lighter);
      border-radius: 3px;
    }
    .target-toggle{
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 8px;
      text-align: left;
      border-radius: 0;
      background: none;
    }
    .caret{
      display: inline-block;
      transition: transform 0.15s;
    }
    [aria-expanded="true"] .caret{
      transform: rotate(90deg);
    }
    .models{
      max-height: 9em;
      overflow-y: auto;
    }
    .option{
      padding: 4px 8px;
      cursor: pointer;
    }
    .option:hover{ background: var(--background-light); }
    .option[aria-selected="true"]{ background: var(--primary); }
    ul{
      list-style: none;
      margin: 0;
      padding: 0;
      max-height: 35vh;
      overflow-y: auto;
    }
    li{
      padding: 4px 8px;
    }
    li:nth-child(even){ background: rgba(255, 255, 255, 0.04); }
    /* On one line: the name gives way */
    .row{
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: 1.6em;
    }
    .row > *{
      flex: 0 0 auto;
      white-space: nowrap;
    }
    .row > .file-name{
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
    }
    .stem{
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ext{
      flex: 0 0 auto;
    }
    li.model .file-name, li.outside .file-name{
      color: var(--text-dim);
    }
    /* Not to be mistaken for a file that's there */
    li.missing .file-name{
      color: var(--missing);
      font-style: italic;
    }
    .tag{
      font-size: 0.85em;
      font-style: italic;
      color: var(--text-dim);
    }
    .tag.warning{ color: var(--warning); }
    /* Voyager's styles for its icons don't reach in here */
    .model-icon ff-icon{
      display: block;
      height: 1em;
      fill: var(--model);
    }
    .model-icon ff-icon svg{
      display: block;
      height: 100%;
      width: auto;
    }
    .sr-only{
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    .tag.error{ color: var(--error); font-style: normal; font-weight: bold; }
    .indicator, .indicator:hover:not(:disabled){
      padding: 0;
      background: none;
      cursor: help;
      text-decoration: underline dotted;
      text-underline-offset: 2px;
    }
    /* Under its indicator, ending where it ends: it's above anything that would cut it */
    .note{
      position: fixed;
      z-index: 3;
      transform: translateX(-100%);
      box-sizing: border-box;
      max-width: 280px;
      padding: 6px 8px;
      font-size: 0.9em;
      background: var(--background-lighter);
      border-radius: 3px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    }
    .status{
      font-size: 0.85em;
      color: var(--text-dim);
    }
    .file-error{
      color: var(--error);
      font-size: 0.9em;
    }
    .add-files{
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .chips{
      display: flex;
      flex-wrap: wrap;
      gap: 3px;
    }
    .chip{
      position: relative;
      padding: 3px 8px;
      cursor: pointer;
      border-radius: 3px;
      background: var(--background-light);
    }
    .chip:hover{ background: var(--background-lighter); }
    .chip[aria-checked="true"]{ background: var(--primary); }
    /* Already in the target model: it will be replaced */
    .chip.present{ box-shadow: inset 0 0 0 1px var(--warning); }
    .chip.present::after, .legend::before{
      content: "";
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--warning);
    }
    .chip.present::after{
      position: absolute;
      top: 2px;
      right: 2px;
    }
    .legend::before{
      display: inline-block;
      margin: 0 6px 1px 2px;
    }
    .optimize{
      display: flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
    }
    .actions{
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    .button.primary{
      padding: 6px 14px;
    }
    .error-msg{
      text-align: center;
      color: var(--error);
    }
    .error-msg:empty{ display: none; }
    .busy{
      position: absolute;
      inset: 0;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: rgba(38, 38, 38, 0.9);
    }
  `;
}

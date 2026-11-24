import StoryImportMenu, { ImportResult, ImportTarget } from "../composants/StoryImportMenu";

/**
 * Voyager Story's imports go through eCorpus's import menu (see composants/StoryImportMenu.ts), the scene's gateway for files:
 * dropped files, and the Navigator's "Import" button.
 *
 * Loaded after voyager-story.js, with the scene's name as `data-scene`.
 */

// Voyager's contract (source/voyager/source/client/io/ImportFilesEvent.ts).
// Repeated here: Voyager's sources don't resolve from this project's tsconfig.
interface ImportFilesEventDetail{
  /** The dropped files, by path among them. Empty from the "Import" button */
  files: Map<string, File>;
  models: ImportTarget[];
  /** Take the import over: Voyager does what the promise resolves with */
  respondWith(result: Promise<ImportResult>): void;
}
type ImportFilesEvent = CustomEvent<ImportFilesEventDetail>;

/** Take over Voyager Story's imports into `scene` */
export function handleImports(scene: string, story: HTMLElement){
  story.addEventListener("import-files", (e: Event)=>{
    const {files, models, respondWith} = (e as ImportFilesEvent).detail;
    respondWith(StoryImportMenu.show(story, {
      scene,
      files,
      models,
      lang: story.getAttribute("uiLang") ?? undefined,
    }));
  });
}


const scene = (document.currentScript as HTMLScriptElement|null)?.dataset.scene;
const story = document.querySelector("voyager-story") as HTMLElement | null;

if(!scene || !story){
  console.warn("Voyager Story's imports aren't handled: no scene or no <voyager-story> element");
}else if(story.getAttribute("mode") === "Standalone"){
  //Files stay in the browser
}else{
  handleImports(scene, story);
}

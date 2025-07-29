import { toPointers } from "../merge/pointers/index.js";
import { DerefDocument, fromMap } from "../merge/pointers/types.js";
import { IDocument } from "./document.js";
import { IArticle } from "./meta.js";
import { IAnnotation } from "./model.js";
import { Dictionary } from "./types.js";

interface ScrappedDocumentData{
  copyright?:string;
  setup?:string;
  languages:string[];
  title?:string;
  intro?:string;
  articles: IArticle[];
  annotations: IAnnotation[];
}

interface ScrapSettings{
  lang?:string;
}

/**
 * Scrap useful data from a scene document
 * Uses `toPointers` so it may easily throw if a document is invalid
 */
export default function scrapDoc(doc:IDocument|any, settings:ScrapSettings) :ScrappedDocumentData{
  let userLang = settings?.lang?.toUpperCase() ?? "EN";
  if(!doc || typeof doc !== "object") return {articles: [], annotations: [], languages: []};
  //Dereferencing here is not required but it makes the whole algorithm more concise and helps test our code in more diverse situations
  let deref = toPointers(doc);

  let collections = [
    deref.scene.meta?.collection,
    ...Object.values(deref.scene.nodes).map(n=>n.meta?.collection),
  ].filter<Dictionary<any>>((c):c is Dictionary<any> => !!c);

  function findInCollections(key:string, ...languages:Array<string|undefined>){
    for(let lang of languages){
      if(!lang) continue
      for(let c of collections){
        if(c[key]?.[lang]) return c[key][lang];
      }
    }
  }

  let setup :string|undefined = deref.scene.setup?.language?.language;

  let title = findInCollections("titles", userLang, setup);


  let intro = findInCollections("intros", userLang, setup);

  let articles = fromMap(deref.scene.meta?.articles ?? {});

  let annotations =  fromMap(deref.scene.nodes).map(n=>fromMap(n.model?.annotations ?? {})).flat();

  let languages = Array.from(new Set([
    setup,
    ...Object.keys(deref.scene.meta?.collection?.titles ?? {}),
    ...Object.keys(deref.scene.meta?.collection?.intros ?? {}),
    ...articles.map(a=>Object.keys(a.uris ?? {})).flat(),
    ...annotations.map(a=>Object.keys(a.titles ?? {})).flat(),
  ])).filter<string>((l):l is string =>!!l);

  return {
    copyright: deref.asset.copyright,
    setup,
    languages,
    title,
    intro,
    articles,
    annotations,
  };
}
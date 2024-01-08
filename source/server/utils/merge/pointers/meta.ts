import { IDocument } from "../../schema/document.js";
import { IMeta } from "../../schema/meta.js";
import { DerefMeta, toIdMap, toUriMap } from "./types.js";

export function appendMeta(document :Required<IDocument>, meta :DerefMeta) :number{
  let iMeta :IMeta = {};

  if(meta.collection) iMeta.collection = meta.collection;

  if(meta.process) iMeta.process = meta.process;

  let images = Object.values(meta.images ?? {});
  if(images.length){
    iMeta.images = images;
  }

  let articles = Object.values(meta.articles ?? {});
  if(articles.length){
    iMeta.articles = articles;
  }

  let audio = Object.values(meta.audio ?? {});
  if(audio.length){
    iMeta.audio = audio;
  }

  if(meta.leadArticle){
    const idx = iMeta.articles?.findIndex((article)=>article.id === meta.leadArticle);
    if(idx != -1) iMeta.leadArticle = idx;
    else throw new Error(`Lead article ${meta.leadArticle} not found in meta.articles`);
  }

  const idx = document.metas.push(iMeta) - 1;
  return idx;
}


export function mapMeta(iMeta :IMeta) :DerefMeta{
  let meta :DerefMeta = {};

  if(iMeta.collection) meta.collection = iMeta.collection;

  if(iMeta.process) meta.process = iMeta.process;

  if(iMeta.images?.length){
    meta.images = toUriMap(iMeta.images);
  }
  if(iMeta.articles?.length){
    meta.articles = toIdMap(iMeta.articles);
  }

  if(iMeta.audio?.length){
    meta.audio = toIdMap(iMeta.audio);
  }

  if(typeof iMeta.leadArticle === "number"){
    meta.leadArticle = iMeta.articles![iMeta.leadArticle]?.id;
  }

  return meta;
}

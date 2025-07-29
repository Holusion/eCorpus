import { IDocument } from "../../schema/document.js";
import { IMeta } from "../../schema/meta.js";
import { DerefMeta, fromMap, toIdMap, toUriMap } from "./types.js";

export function appendMeta(document :Required<IDocument>, {images, articles, actions, audio, leadArticle, ...meta} :DerefMeta) :number{
  let iMeta :IMeta = meta;


  let _images = fromMap(images ?? {});
  if(_images.length){
    iMeta.images = _images;
  }

  let _articles = fromMap(articles ?? {});
  if(_articles.length){
    iMeta.articles = _articles;
  }

  let _actions = fromMap(actions ?? {});
  if(_actions.length){
    iMeta.actions = _actions;
  }

  let _audio = fromMap(audio ?? {});
  if(_audio.length){
    iMeta.audio = _audio;
  }

  if(leadArticle){
    const idx = iMeta.articles?.findIndex((article)=>article.id === leadArticle) ?? -1;
    if(idx != -1) iMeta.leadArticle = idx;
    else throw new Error(`Lead article ${leadArticle} not found in meta.articles`);
  }

  const idx = document.metas.push(iMeta) - 1;
  return idx;
}


export function mapMeta({images, articles, actions, audio, leadArticle, ...iMeta} :Readonly<IMeta>) :DerefMeta{
  let meta :DerefMeta = {
    ...iMeta,
  };

  if(images?.length){
    meta.images = toUriMap(images);
  }

  if(articles?.length){
    meta.articles = toIdMap(articles);
  }

  if(actions?.length){
    meta.actions = toIdMap(actions);
  }

  if(audio?.length){
    meta.audio = toIdMap(audio);
  }

  if(typeof leadArticle === "number"){
    meta.leadArticle = articles![leadArticle]?.id;
  }

  return meta;
}

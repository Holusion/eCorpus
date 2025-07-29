import { IAction, IArticle, IAudioClip, IImage, IMeta } from "../../schema/meta.js";
import uid from "../../uid.js";
import { appendMeta, mapMeta } from "./meta.js"
import { DerefMeta, Indexed, SOURCE_INDEX } from "./types.js";

const article :Readonly<IArticle>= {
  id: uid(),
  uri: "/foo.html",
};

const audio :Readonly<IAudioClip> = {
  id: uid(),
  name: "foo",
  uris: {},
  captionUris: {},
  durations: {},
};

const action :Readonly<IAction> = {
  id: uid(),
  type: "PlayAnimation",
  trigger: "OnClick",
};

const image :Readonly<IImage> = {
  quality: "High",
  uri: "foo.jpg",
  byteSize: 0,
  width: 0,
  height: 0
};


describe("appendMeta()", function(){



  it("supports empty object", function(){
    let doc :any = {metas: []};
    expect(appendMeta(doc, {})).to.equal(0);
    expect(appendMeta(doc, {foo: "bar"} as any)).to.equal(1);
    expect(doc).to.have.deep.property("metas", [
      {},
      {foo: "bar"},
    ]);
  });

  it("keeps all known meta properties", function(){


    let meta = {
      images: {[image.uri]: {...image, [SOURCE_INDEX]: 0}},
      articles: { [article.id]: {...article, [SOURCE_INDEX]: 0}, },
      audio: { [audio.id]: {...audio, [SOURCE_INDEX]:0}, },
      actions: { [action.id]: {...action, [SOURCE_INDEX]: 0} },
      leadArticle: article.id,
      collection: { titles: {FR: "Titre"}},
      process: {}
    } satisfies Required<DerefMeta>;
    
    let doc :any = {metas: []};
    expect(appendMeta(doc, meta)).to.equal(0);
    expect(doc.metas[0]).to.deep.equal({
      collection: meta.collection,
      process: {},
      images: [image],
      articles: [article],
      audio: [audio],
      actions: [action],
      leadArticle: 0
    } satisfies Required<IMeta>)
  });

  it("throws on bad lead article", function(){
    expect(()=>appendMeta({metas: []} as any, {articles: {}, leadArticle: "foo"})).to.throw(`Lead article foo not found in meta.articles`)
  })
});

describe("mapMeta()", function(){
  it("supports empty objects", function(){
    expect(()=>mapMeta({})).not.to.throw();
  });

  it("maps all known properties", function(){
    let meta = mapMeta({
      actions: [action],
      collection: { titles: {FR: "titre"}},
      process: {},
      images: [image],
      articles: [article],
      audio: [audio],
      leadArticle: 0
    } satisfies Required<IMeta>);

    expect(meta).to.deep.equal({
      images: { [image.uri]: {...image, [SOURCE_INDEX]: 0}},
      articles: { [article.id]: {...article, [SOURCE_INDEX]: 0}},
      audio: { [audio.id]: {...audio, [SOURCE_INDEX]: 0}},
      actions: { [action.id]: {...action, [SOURCE_INDEX]: 0}},
      leadArticle: article.id,
      collection: { titles: {FR: "titre"}},
      process: {}
    } satisfies Required<DerefMeta>);
  });

  it("maps additional properties", function(){
    expect(mapMeta({idx: 0, map: [{foo: "bar"}]} as any)).to.deep.equal({
      idx: 0,
      map: [{foo: "bar"}],
    })
  });
})
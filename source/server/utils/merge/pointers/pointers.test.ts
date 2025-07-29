import fs from 'fs/promises';
import path from "path";
import { fileURLToPath } from 'url';

import { fromPointers, toPointers } from "./index.js";
import { IDocument, IScene } from '../../schema/document.js';
import { DerefNode, DerefScene, SOURCE_INDEX } from './types.js';
import uid from '../../uid.js';


const thisDir = path.dirname(fileURLToPath(import.meta.url));

const baseDoc = {
  asset: {    
    type: "application/si-dpo-3d.document+json",
    version: "1"
  },
  scene: 0,
  scenes:[{}]
} as const;


describe("(de)reference pointers", function(){
  /**
   * Most Tests are grouped together (see below)
   * as a fromPointer => toPointer comparison
   * because we generally want to test reversibility
   */


  describe("fromPointers()", function(){

    it("copies a scene's name and units", function(){
      const deref = {asset: baseDoc.asset, scene:{
        name: "My Scene",
        units: "km",
        nodes: [],
      }};
      const doc = fromPointers(deref as any);
      expect(doc.scene).to.equal(0);
      expect(doc.scenes).to.deep.equal([{
        name: "My Scene",
        units: "km",
      }]);
    });


    it("builds nodes reference arrays", function(){
      const deref = {
        asset: baseDoc.asset,
        scene: {
          units: "m",
          nodes:{
            "Th8JYtrkNCV6": {[SOURCE_INDEX]:0, id: "Th8JYtrkNCV6", name: "Camera", camera: {type: "perspective"}},
            "aubbHqyLuye2": {[SOURCE_INDEX]:1, id: "aubbHqyLuye2", name: "Lights", children: [{[SOURCE_INDEX]:0, id: "Xm20ZazxwRbP", name:"L1",light:{"type":"ambient"}}]},
            "PeIZ72MDwAGH": {[SOURCE_INDEX]:2, id: "PeIZ72MDwAGH", name: "Model", model: {derivatives:{"High/Web3D":{assets:{ "model.gltf":{uri: "model.gltf"}}}}}},
          },
        }
      };

      const doc:IDocument = fromPointers(deref as any);
      //use JSON.parse(JSON.stringify()) to remove undefined values

      expect(doc).to.deep.equal({
        ...baseDoc,
        nodes: [
          {id: "Th8JYtrkNCV6", name: "Camera", camera: 0},
          { id: "aubbHqyLuye2", name: "Lights", children: [2]},
          {id: "Xm20ZazxwRbP", name: "L1", light: 0},
          { id: "PeIZ72MDwAGH", name: "Model", model: 0},
        ],
        scenes:[{
          nodes: [0, 1, 3],
          units: "m",
        }],
        cameras: [{type: "perspective"}],
        lights: [{type: "ambient"}],
        models: [{derivatives: [{assets:[{uri: "model.gltf"}]}]}],
      });
    });

    it("copies nodes matrix/translation/rotation/scale properties", function(){
      const node :DerefNode = {
        id: "PeIZ72MDwAGH",
        name: "Model",
        model: {
          [SOURCE_INDEX]: 0,
          units: "cm",
          derivatives:{
            "High/Web3D": {[SOURCE_INDEX]: 0, quality: "High", usage: "Web3D", assets:{ "model.gltf": {[SOURCE_INDEX]: 0, uri: "model.gltf", type:"Model"}}}
          }
        },
        matrix: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
        translation:[0,0,0],
        rotation: [0, 0, 0, 0],
        scale: [1, 1, 1],
      };

      const deref = {
        asset: baseDoc.asset,
        scene: {
          units: "m",
          nodes:{"PeIZ72MDwAGH": node},
        }
      };

      const doc:IDocument = fromPointers(deref as any);
      //use JSON.parse(JSON.stringify()) to remove undefined values
      expect(doc).to.have.property("nodes").to.deep.equal([
        {
          id: "PeIZ72MDwAGH",
          name: "Model",
          model: 0,
          matrix: node.matrix,
          translation: node.translation,
          rotation: node.rotation,
          scale: node.scale,
        },
      ]);
      expect(doc).to.have.property("models").to.deep.equal([{
        units: "cm",
        derivatives:[{
          quality: "High", usage: "Web3D", 
          assets:[{uri: "model.gltf", type:"Model"}]
        }]
      }]);
    });


    it("builds metas from scene", function(){
      const deref = {
        asset: baseDoc.asset,
        scene: {
          units: "m",
          meta: {collection: {titles:{EN: "Meta Title"}}},
          nodes: [],
        }
      };

      const doc:IDocument = fromPointers(deref as any);
      //use JSON.parse(JSON.stringify()) to remove undefined values
      expect(doc).to.deep.equal({
        ...baseDoc,
        scenes:[{
          units: "m",
          meta: 0,
        }],
        metas: [{collection: {titles:{EN: "Meta Title"}}}],
      });
    });

    it("builds metas from nodes", function(){
      const deref = {
        asset: baseDoc.asset,
        scene: {
          units: "m",
          nodes:{
            "tk1NvhOtDq6e": { id: "tk1NvhOtDq6e", name: "Model", meta: {collection: {titles:{EN: "Meta Title"}}}},
          },
        }
      };

      const doc:IDocument = fromPointers(deref as any);
      //use JSON.parse(JSON.stringify()) to remove undefined values
      expect(doc).to.deep.equal({
        ...baseDoc,
        nodes: [
          {id: "tk1NvhOtDq6e", name: "Model", meta: 0},
        ],
        scenes:[{
          nodes: [0],
          units: "m",
        }],
        metas: [{collection: {titles:{EN: "Meta Title"}}}]
      });
    })

    it("builds setups from scene", function(){
      const deref = {
        asset: baseDoc.asset,
        scene: {
          units: "m",
          setup: {language: {language: "FR"}},
          nodes: [],
        }
      };

      const doc:IDocument = fromPointers(deref as any);
      //use JSON.parse(JSON.stringify()) to remove undefined values
      expect(doc).to.deep.equal({
        ...baseDoc,

        scenes:[{
          setup: 0,
          units: "m",
        }],
        setups: [{language: {language: "FR"}}]
      });
    });

  });


  describe("toPointers()", function(){
    it("dereferences nodes with children", function(){
      const doc = {
        ...baseDoc,
        nodes: [
          {name: "Lights", children: [1]},
          {name: "L1", light: 0}
        ],
        scenes:[{nodes: [0]}],
        lights: [{type: "ambient"}]
      };

      const deref:any = toPointers(doc as any);
      expect(Object.keys(deref)).to.deep.equal(["asset", "scene"]);
      expect(deref.asset).to.deep.equal(doc.asset);
      //use JSON.parse(JSON.stringify()) to remove undefined values
      expect(JSON.parse(JSON.stringify(deref.scene))).to.deep.equal({"nodes":{
        "#0": {"name":"Lights","children":{"#1": {"name":"L1","light":{"type":"ambient"}}}}
      }});
    });

    it("dereferences scene setup", function(){
      const doc = {
        ...baseDoc,
        nodes: [],
        scenes:[{setup: 0}],
        setups: [{language: {language: "FR"}}]
      };

      const deref:any = toPointers(doc as any);
      expect(Object.keys(deref)).to.deep.equal(["asset", "scene"]);
      expect(deref.asset).to.deep.equal(doc.asset);
      //use JSON.parse(JSON.stringify()) to remove undefined values
      expect(JSON.parse(JSON.stringify(deref.scene))).to.deep.equal({
        "nodes": {},
        "setup":{language: {language: "FR"}},
      });
    });

    it("dereferences scene meta", function(){
      const doc = {
        ...baseDoc,
        nodes: [],
        scenes:[{meta: 0}],
        metas: [{collection: {titles:{FR: "Hello World!"}}}]
      };

      const deref:any = toPointers(doc as any);
      expect(Object.keys(deref)).to.deep.equal(["asset", "scene"]);
      expect(deref.asset).to.deep.equal(doc.asset);
      //use JSON.parse(JSON.stringify()) to remove undefined values
      expect(JSON.parse(JSON.stringify(deref.scene))).to.deep.equal({
        "nodes": {},
        "meta":{collection: {titles:{FR: "Hello World!"}}}
      });

    });

    it("dereferences node's meta", function(){

      const doc = {
        ...baseDoc,
        nodes: [{
          id: "63llEWWkWimp",
          name: "Model",
          meta: 0
        }],
        scenes:[{
          nodes: [0]
        }],
        metas: [{collection: {titles:{FR: "Hello World!"}}}]
      };

      const deref:any = toPointers(doc as any);
      expect(Object.keys(deref)).to.deep.equal(["asset", "scene"]);
      expect(deref.asset).to.deep.equal(doc.asset);
      //use JSON.parse(JSON.stringify()) to remove undefined values
      expect(JSON.parse(JSON.stringify(deref.scene))).to.deep.equal({
        "nodes": {"63llEWWkWimp": {id: "63llEWWkWimp", name: "Model", meta: {collection: {titles:{FR: "Hello World!"}}}}},
      });

    });
    
    it("dereferences node's model", function(){
      const doc = {
        ...baseDoc,
        nodes: [{
          id: "63llEWWkWimp",
          name: "Model",
          model: 0
        }],
        scenes:[{
          nodes: [0]
        }],
        models: [
            {
              name: "My Model",
              derivatives: [
                {
                  usage: "Web3D",
                  quality: "High",
                  assets: []
                }
              ],
            },
          ],
      };

      const deref:any = toPointers(doc as any);
      expect((deref.scene as DerefScene).nodes["63llEWWkWimp"].model).to.have.property("name", "My Model");
    });

    it("keeps a scene's name and units", function(){

      const doc = {
        ...baseDoc,
        scenes:[{
          name: "My Scene",
          units: "km",
        }],
      };

      const deref:any = toPointers(doc as any);
      expect(Object.keys(deref)).to.deep.equal(["asset", "scene"]);
      expect(deref.asset).to.deep.equal(doc.asset);
      //use JSON.parse(JSON.stringify()) to remove undefined values
      expect(JSON.parse(JSON.stringify(deref.scene))).to.deep.equal({
        "name": "My Scene",
        "units": "km",
        "nodes": {},
      });
    });

    describe("throws", function(){
      it("if no doc is provided", function(){
        expect(()=> toPointers(null as any)).to.throw("Can't dereference invalid document null");
        expect(()=> toPointers(undefined as any)).to.throw("Can't dereference invalid document undefined");
        expect(()=> toPointers("" as any)).to.throw("Can't dereference invalid document ");
      });

      it("if doc has no scene", function(){
        const doc = {...baseDoc, scenes: []};
        expect(()=> toPointers(doc)).to.throw("Document has no valid scene");
      });

      it("if doc has an invalid scene index", function(){
        const doc = {...baseDoc, scene: 1};
        expect(()=> toPointers(doc  as any)).to.throw("Document's scene #1 is invalid");
      });

      it("if scene has invalid node index", function(){
        const doc = {...baseDoc, scenes:[{nodes: [1]}], nodes:[{name: "Camera"}]};
        expect(()=> toPointers(doc  as any)).to.throw(`Invalid node index 1 in scene #0`);
      });

      "camera/light/model/meta".split("/").forEach(key=>{
        it(`if node has invalid ${key} index`, function(){
          const doc = {...baseDoc, scenes:[{nodes:[0]}], nodes:[{name: key.toUpperCase(), [key]: 0}]};
          expect(()=> toPointers(doc  as any)).to.throw(`in node 0 Invalid ${key} index 0`);
        });
      })



      it("if scene has invalid setup index", function(){
        const doc = {...baseDoc, scenes:[{setup: 0}]};
        expect(()=> toPointers(doc  as any)).to.throw(`Invalid setup #0 in scene #0`);
      });

      it("if scene has invalid meta index", function(){
        const doc = {...baseDoc, scenes:[{meta: 0}]};
        expect(()=> toPointers(doc  as any)).to.throw(`Invalid meta #0 in scene #0`);
      });
    });
  });


  describe("is reversible", function(){
    const paths:Record<string, string> = [
      "01_simple.svx.json",
    ].reduce((paths, file)=>({...paths, [file]: path.resolve(thisDir, "../../../__test_fixtures/documents/"+file)}),{});

    it("keeps meta indexes", function(){
      //in voyager code, the scene's meta is always serialized after any children
      //So we want to ensure consistent behaviour here
      let doc = {
        asset: baseDoc.asset,
        scene: 0,
        scenes: [{units: "cm", nodes:[0], meta: 1}],
        nodes: [
          {id: uid(), meta: 0},
        ],
        metas: [
          {srcIndex: 0} as any,
          {srcIndex: 1} as any,
        ]
      } satisfies IDocument;
      expect(fromPointers(toPointers(doc))).to.have.deep.property("metas",[
        {srcIndex: 0},
        {srcIndex: 1},
      ]);
    });

    it("don't skip unknown properties", function(){
      const doc:any = {
        asset: {
          foo: "bar",
        },
        scene: 0,
        scenes: [{
          units: "m",
          foo: "bar",
          meta: 1,
          setup: 0,
          nodes: [0],
        }],
        nodes: [
          {
            id: "6QGcz2oiUAk2",
            name: "6QGcz2oiUAk2",
            meta:0,
            foo: "bar",
            model: 0,
            light: 0,
            camera: 0,
          }
        ],
        setups: [
          {foo: "bar"}
        ],
        metas: [
          {foo: "bar"},
          {foo: "bar"},
        ],
        models: [
          {
            derivatives: [
              {
                usage: "Web3D",
                quality: "High",
                foo: "bar",
                assets: []
              }
            ],
            foo: "bar"
          },
        ],
        lights: [
          {foo: "bar"},
        ],
        cameras: [
          {foo: "bar"},
        ]
      };

      const redoc:any = fromPointers(toPointers(doc));
      expect(redoc).to.deep.equal(doc);
    })

    describe("01_simple.svx.json", function(){
      let docString :string, doc :IDocument;
      this.beforeAll(async function(){
        docString = await fs.readFile(paths["01_simple.svx.json"], "utf8");
      });
      this.beforeEach(function(){
        doc = JSON.parse(docString);
      });

      it("can be dereferenced", async function(){
        const deref = toPointers(doc);
        expect(deref).to.be.ok;
        expect(Object.keys(deref)).to.deep.equal(["asset", "scene"]);
        expect(deref.asset).to.deep.equal(doc.asset);
        expect(Object.keys(deref.scene)).to.deep.equal(["units", "nodes", "setup"]);
        expect(Object.keys(deref.scene.nodes)).to.have.property("length", 3);
        expect(deref.scene.nodes["ot9vj20DZ6Y5"]).to.have.property("meta").to.deep.equal({collection: {titles:{EN: "Meta Title"}}});
      });

      it("SOURCE_INDEX is removed", async function(){
        function walk(obj :any, path:string){
          if( (SOURCE_INDEX in obj)) throw new Error(`${path}: Symbol("SOURCE_INDEX")`);
          for(let key in obj){
            if(typeof obj[key] === "object") walk(obj[key], `${path}.${key}`);
          }
        }
        const deref = toPointers(doc);
        const redoc = fromPointers(deref);
        expect(()=>walk(redoc, "doc")).not.to.throw();
      });

      it("dereferencing is indempotent", async function(){
        const deref = toPointers(doc);
        const redoc = fromPointers(deref);
        //console.log(JSON.stringify(redoc, null, 2));
        expect(redoc).to.deep.equal(doc);
      });

      it("is JSON - stable", async function(){
        let previous_string = null;
        for(let i=0; i <2; i++){
          const deref = toPointers(doc);
          const redoc = fromPointers(deref);
          const redoc_string = JSON.stringify(redoc, null, 2);
          if(previous_string) expect(redoc_string).to.equal(previous_string);
          previous_string = redoc_string;
        }
      });

    });

  });
})
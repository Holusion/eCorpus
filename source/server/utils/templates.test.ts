import fs from "fs/promises";
import {tmpdir} from "os";
import path from "path";
import { fileURLToPath } from 'url';

import Templates from "./templates.js";
import express, { Express, NextFunction, Request, Response } from "express";
import request from "supertest";

const thisDir = path.dirname(fileURLToPath(import.meta.url));

describe("Templates", function(){

  describe("with a basic template", function(){
    let dir:string;
    let tmpl :string;
    let t :Templates
    this.beforeAll(async function(){
      dir = await fs.mkdtemp(path.join(tmpdir(), "ecorpus_templates_test"));
      await fs.mkdir(path.join(dir, "layouts"));
      tmpl = path.join(dir, "home.hbs");
      await fs.writeFile(tmpl, "Hello {{name}}");
      t = new Templates({dir, cache: false});
    });
    this.afterAll(async function(){
      await fs.rm(dir, {recursive: true});
    })

    it("renders a template", async function(){
      let txt = await t.render(tmpl, {name: "World", layout: null});
      expect(txt).to.be.a.string;
      expect(txt).to.equal("Hello World");
    });

    it("renders a template with relative path", async function(){
      let txt = await t.render(path.basename(tmpl), {name: "World", layout: null});
      expect(txt).to.be.a.string;
      expect(txt).to.equal("Hello World");
    });

    it("renders a template without file extension", async function(){
      let txt = await t.render(path.basename(tmpl.slice(0,-4)), {name: "World", layout: null});
      expect(txt).to.be.a.string;
      expect(txt).to.equal("Hello World");
    });

    it("renders a template with default layout", async function(){
      await fs.writeFile(path.join(dir, "layouts", "main.hbs"), "<!DOCTYPE html><html><head><title>{{title}}</title></head><body>{{{body}}}</html>");
      let txt = await t.render(tmpl, {name: "World", title: "TITLE"});
      expect(txt).to.be.a.string;
      expect(txt).to.contain("Hello World");
      expect(txt).to.contain("<title>TITLE</title>");
    });

    it("renders a template with custom layout", async function(){
      await fs.writeFile(path.join(dir, "layouts", "custom.hbs"), "{{title}}\n{{{body}}}");
      let txt = await t.render(tmpl, {name: "World", title: "TITLE", layout: "custom"});
      expect(txt).to.be.a.string;
      expect(txt).to.equal("TITLE\nHello World");
    });

  });

  describe("partials", function(){
    let t :Templates, dir :string;

    this.beforeAll(async function(){
      dir = await fs.mkdtemp(path.join(tmpdir(), "ecorpus_templates_test"));
      t = new Templates({dir, cache: false});
      await fs.mkdir(path.join(dir, "partials"));
    });
    this.afterAll(async function(){
      await fs.rm(dir, {recursive: true});
    });

    it("finds partials in directory", async function(){
      await fs.writeFile(path.join(dir, "partials", "test.hbs"), "Foo");
      let partials = await t.getPartials();
      expect(partials).to.have.property("test");
    });

    it("finds nested partials", async function(){
      await fs.mkdir(path.join(dir, "partials/foo"))
      await fs.writeFile(path.join(dir, "partials/foo", "bar.hbs"), "Bar");
      let partials = await t.getPartials();
      expect(partials).to.have.property("foo/bar");
    });

    it("renders a template with partials", async function(){
      const tmpl = path.join(dir, "partial.hbs");
      await fs.writeFile(tmpl, "{{> part }}");
      await fs.writeFile(path.join(dir, "partials", "part.hbs"), "Hello World");
      let txt = await t.render(tmpl, {name: "World", title: "TITLE", layout: null});
      expect(txt).to.be.a.string;
      expect(txt).to.equal("Hello World");
    });

    it("throws if partial is not found", async function(){
      const tmpl = path.join(dir, "partial_not_found.hbs");
      await fs.writeFile(tmpl, "{{> partial_not_found }}");
      await expect(t.render(tmpl)).to.be.rejectedWith("The partial partial_not_found could not be found");
    });
  });

  describe("cache", function(){
    let dir :string;

    this.beforeAll(async function(){
      dir = await fs.mkdtemp(path.join(tmpdir(), "ecorpus_templates_test"));
    });
    this.afterAll(async function(){
      await fs.rm(dir, {recursive: true});
    });

    it("enabled", async function(){
      let tmpl = path.join(dir, "test_enabled.hbs");
      await fs.writeFile(tmpl, "Hello {{name}}");
      let t = new Templates({dir, cache: true});
      let txt = await t.render(tmpl, {name: "World", layout: null});
      expect(txt).to.equal("Hello World");
      await fs.rm(tmpl);
      txt = await t.render(tmpl, {name: "World", layout: null});
      expect(txt).to.equal("Hello World");
    });
    
    it("disabled", async function(){
      let tmpl = path.join(dir, "test_disabled.hbs");
      await fs.writeFile(tmpl, "Hello {{name}}");
      let t = new Templates({dir, cache: false});
      let txt = await t.render(tmpl, {name: "World", layout: null});
      expect(txt).to.equal("Hello World");
      await fs.writeFile(tmpl, "Goodbye {{name}}");
      txt = await t.render(tmpl, {name: "World", layout: null});
      expect(txt).to.equal("Goodbye World");
    });

    describe("partials", function(){
      this.beforeAll(async function(){
        await fs.mkdir(path.join(dir, "partials"));
      });

      it("enabled", async function(){
        await fs.writeFile(path.join(dir, "partials/cached_part.hbs"), "Hello {{name}}");
        let tmpl = path.join(dir, "test_enabled_partials.hbs");
        await fs.writeFile(tmpl, "{{> cached_part }}");

        let t = new Templates({dir, cache: true});
        let txt = await t.render(tmpl, {name: "World", layout: null});
        expect(txt).to.equal("Hello World");
        await fs.rm(path.join(dir, "partials/cached_part.hbs"));
        txt = await t.render(tmpl, {name: "World", layout: null});
        expect(txt).to.equal("Hello World");
      });

      it("disabled", async function(){
        await fs.writeFile(path.join(dir, "partials/uncached_part.hbs"), "Hello {{name}}");
        let tmpl = path.join(dir, "test_enabled_partials.hbs");
        await fs.writeFile(tmpl, "{{> uncached_part }}");
        let t = new Templates({dir, cache: false});
        let txt = await t.render(tmpl, {name: "World", layout: null});
        expect(txt).to.equal("Hello World");
        await fs.writeFile(path.join(dir, "partials/uncached_part.hbs"), "Goodbye World");
        txt = await t.render(tmpl, {name: "World", layout: null});
        expect(txt).to.equal("Goodbye World");
      });
    })
  });


  describe("as a middleware", function(){
    let app :Express;
    let t :Templates;
    let errors = [];
    let dir :string;
    this.beforeAll(async function(){
      dir = await fs.mkdtemp(path.join(tmpdir(), "ecorpus_templates_test"));
      t = new Templates({dir, cache: false});
      app = express();
      app.engine('.hbs', t.middleware);
      app.set('view engine', '.hbs');
      app.set('views', dir);
      app.get("/layout/:name", (req, res)=>{
        res.render(req.params.name, {name: req.params.name, layout: "l"});
      });
      app.get("/:name", (req, res)=>{
        res.render(req.params.name, {name: req.params.name, layout: null});
      });
      app.use((err:Error, req :Request, res:Response, next :NextFunction)=>{
        errors.push(err);
        res.status(500).send(err.message);
        return;
      })
      await fs.writeFile(path.join(dir, "home.hbs"), "Hello {{name}}");
    });
    this.afterAll(async function(){
      await fs.rm(dir, {recursive: true});
    });

    it("resolves templates", async function(){
      await request(app).get("/home")
      .expect(200)
      .expect("Hello home")
      .expect("Content-Type", "text/html; charset=utf-8");
    });

    it("wraps errors for missing templates", async function(){
      await request(app).get("/xxx")
      .expect(500)
      .expect(`Failed to lookup view "xxx" in views directory "${dir}"`);
    });

    it("wraps errors for missing layouts", async function(){
      await request(app).get("/layout/home")
      .expect(500)
      .expect(`[500] ENOENT: no such file or directory, open '${path.join(dir, "layouts/l.hbs")}'`);
    });
  });
});
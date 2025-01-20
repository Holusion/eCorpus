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

  describe("helpers", function(){
    let t :Templates, dir :string;

    this.beforeAll(async function(){
      dir = await fs.mkdtemp(path.join(tmpdir(), "ecorpus_templates_test"));
      t = new Templates({dir, cache: false});
      await fs.mkdir(path.join(dir, "locales"));
      await fs.writeFile(path.join(dir, "locales/fr.yml"), `---\ngreet: Bonjour Monde\n`);
      await fs.writeFile(path.join(dir, "locales/en.yml"), `---\ngreet: Hello World\n`);
    });
    this.afterAll(async function(){
      await fs.rm(dir, {recursive: true});
    });

    describe("join", function(){
      this.beforeAll(async function(){
        await fs.writeFile(path.join(dir, "concat_test.hbs"), `{{join "hello" foo}}`);
      });

      it("join path parts", async function(){
        await expect(t.render("concat_test", {layout: null, foo: "/world"})).to.eventually.equal("hello/world");
      });
      it("join arrays", async function(){
        await expect(t.render("concat_test", {layout: null, foo: ["world", "and", "universe"]})).to.eventually.equal("helloworldanduniverse");

      })
      it("stringifies parameters", async function(){
        await expect(t.render("concat_test", {layout: null, foo: null}), `Stringifies null`).to.eventually.equal("hellonull");
        await expect(t.render("concat_test", {layout: null, foo: {}}), `Stringifies an empty object`).to.eventually.equal("hello[object Object]");
        await expect(t.render("concat_test", {layout: null, foo: 1}), `Stringifies a number`).to.eventually.equal("hello1");
      })
      it("handles undefined", async function(){
        //Otherwise path.join() throws, and we don't want that
        await expect(t.render("concat_test", {layout: null, foo: undefined})).to.eventually.equal("helloundefined");
      });
    })

    describe("i18n", function(){
      this.beforeAll(async function(){
        await fs.writeFile(path.join(dir, "lang_test.hbs"), `{{i18n "greet"}}`);
      });

      it("uses local lang parameter", async function(){
        expect(await t.render("lang_test", {lang: "fr", layout: null})).to.equal("Bonjour Monde");
        expect(await t.render("lang_test", {lang: "en", layout: null})).to.equal("Hello World");
      });

      it("handles \"cimode\"", async function(){
        await expect(t.render("lang_test", {lang: "cimode", layout: null})).to.eventually.equal("greet");
      });
    });

    describe("navLink", function(){
      this.beforeAll(async function(){
        await fs.writeFile(path.join(dir, "navlink_simple.hbs"), `{{#navLink "/foo"}}Foo{{/navLink}}`);
      })
      it("creates an anchor with href", async function(){
        await expect(t.render("navlink_simple", {layout: null})).to.eventually.equal(`<a class="nav-link" href="/foo">Foo</a>`);
      });

      it("match pathname prefix with \"active\" class", async function(){
        await expect(t.render("navlink_simple", {layout: null, location: "/foo"})).to.eventually.equal(`<a class="nav-link active" href="/foo">Foo</a>`);
        await expect(t.render("navlink_simple", {layout: null, location: "/foo/"})).to.eventually.equal(`<a class="nav-link active" href="/foo">Foo</a>`);
        await expect(t.render("navlink_simple", {layout: null, location: "/foo/bar"})).to.eventually.equal(`<a class="nav-link active" href="/foo">Foo</a>`);

        await expect(t.render("navlink_simple", {layout: null, location: "/bar"})).to.eventually.equal(`<a class="nav-link" href="/foo">Foo</a>`);
      });

      it("match exact pathname", async function(){
        await fs.writeFile(path.join(dir, "navlink_exact.hbs"), `{{#navLink "/foo" "exact" }}Foo{{/navLink}}`);
        await expect(t.render("navlink_exact", {layout: null, location: "/foo"}), `/foo should match with exact keyword`).to.eventually.equal(`<a class="nav-link active" href="/foo">Foo</a>`);
        
        await expect(t.render("navlink_exact", {layout: null, location: "/foo/bar"}), `/foo/bar should not match exact keyword`).to.eventually.equal(`<a class="nav-link" href="/foo">Foo</a>`);
        await expect(t.render("navlink_exact", {layout: null, location: "/bar"})).to.eventually.equal(`<a class="nav-link" href="/foo">Foo</a>`);
      });

      it("can have additional properties", async function(){
        await fs.writeFile(path.join(dir, "navlink_params.hbs"), `{{#navLink "/foo" "disabled" 'id="foo"' }}Foo{{/navLink}}`);
        await expect(t.render("navlink_params", {layout: null, location:"/"})).to.eventually.equal(`<a class="nav-link" href="/foo" disabled id="foo">Foo</a>`)
      });
      it("can interpolate its href", async function(){
        await fs.writeFile(path.join(dir, "navlink_interpolation.hbs"), `{{#navLink (join "/foo/" target) }}Foo{{/navLink}}`);
        await expect(t.render("navlink_interpolation", {layout: null, target:"bar", location:"/"})).to.eventually.equal(`<a class="nav-link" href="/foo/bar">Foo</a>`)
      });
    })
  })


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
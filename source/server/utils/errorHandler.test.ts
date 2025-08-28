import path from "node:path";
import { fileURLToPath } from 'node:url';
import { expect } from "chai";
import express, { Express, NextFunction, Request, Response } from "express";
import request from "supertest";
import { errorHandlerMdw, LogLevel, notFoundHandlerMdw } from "./errorHandler.js";
import { InternalError } from "./errors.js";
import Templates from "./templates.js";

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.resolve(thisDir, "../templates");

describe("errorHandler middleware", function(){
    let app :Express;
    this.beforeEach(function(){
      app = express();
      app.get("/", (req, res)=>{
        throw new InternalError("Internal Error");
      });
      app.use(errorHandlerMdw({isTTY:false, logLevel: LogLevel.Quiet}));
    })


    it("defaults to Content-Type: application/json", async function(){
      //Also return application/json as default
      await request(app).get("/")
      .expect(500)
      .expect("Content-Type", "application/json; charset=utf-8");
    });
    

    it("respects Accept: text/plain header", async function(){      
      await request(app).get("/")
      .set("Accept", "text/plain")
      .expect(500)
      .expect("Content-Type", "text/plain; charset=utf-8")
      .expect(/Internal Error/);
    });

    it("respects Accept: application/json header", async function(){
      await request(app).get("/")
      .set("Accept", "application/json")
      .expect(500)
      .expect("Content-Type", "application/json; charset=utf-8");
    });
    
    it("respects Accept: text/html header", async function(){
      const templates = new Templates({dir: templatesDir, cache: false});

      app.engine('.hbs', templates.middleware);
      app.set('view engine', '.hbs');
      app.set('views', templates.dir);

      await request(app).get("/")
      .set("Accept", "text/html")
      .expect(500)
      .expect("Content-Type", "text/html; charset=utf-8")
      .expect(/^<!DOCTYPE html>/);
    });

    it("handles errors (headers sent)", async function(){
      //It's necessarily imperfect, but if headers have already been sent, we just destroy the socket.
      let app :Express = express();
      app.get("/headers", (req, res)=>{
        res.writeHead(200);
        throw new InternalError("FOO");
      });

      app.use(errorHandlerMdw({isTTY:false, logLevel: LogLevel.Quiet}));

      await expect(request(app).get("/headers")
      .set("Accept", "text/plain")
      .expect(200)).to.be.rejectedWith("socket hang up");
    });
  
});

describe("notFoundHandler middleware", function(){
  let app :Express;

  this.beforeEach(function(){
    app = express();
    app.use(notFoundHandlerMdw());
  });

  it("handles 404 errors", async function(){
    await request(app).get("/foo")
    .expect(404)
    .expect("Content-Type", "application/json; charset=utf-8");
  });

  it("respects Accept: application/json header", async function(){
    await request(app).get("/foo")
    .set("Accept", "application/json")
    .expect(404)
    .expect("Content-Type", "application/json; charset=utf-8");
  });

  it("respects Accept: text/plain header", async function(){
    await request(app).get("/foo")
    .set("Accept", "text/plain")
    .expect(404)
    .expect("Content-Type", "text/plain; charset=utf-8");
  });

  it("respects Accept: text/html header", async function(){

    const templates = new Templates({dir: templatesDir, cache: false});

    app.engine('.hbs', templates.middleware);
    app.set('view engine', '.hbs');
    app.set('views', templates.dir);

    await request(app).get("/foo")
    .set("Accept", "text/html")
    .expect(404)
    .expect("Content-Type", "text/html; charset=utf-8")
    .expect(/^<!DOCTYPE html>/);
  });

  it("use default content type", async function(){
    await request(app).get("/foo")
    .set("Accept", "application/zip")
    .expect(404)
    .expect("Content-Type", "text/plain; charset=utf-8");
    //Not testing text/html output because it requires working templates
  });

});
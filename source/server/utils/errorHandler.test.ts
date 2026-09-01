import path from "node:path";
import http from "node:http";
import { once } from "node:events";
import { AddressInfo } from "node:net";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import timers from "node:timers/promises";
import { fileURLToPath } from 'node:url';
import { expect } from "chai";
import express, { Express, NextFunction, Request, Response } from "express";
import request from "supertest";
import { errorHandlerMdw, notFoundHandlerMdw } from "./errorHandler.js";
import { InternalError, UnauthorizedError } from "./errors.js";
import { captureLogs } from "./log/index.js";
import Templates from "./templates/index.js";

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.resolve(thisDir, "../templates");

const mockConfig = { get: (_key: any) => "" } as any;

describe("errorHandler middleware", function(){
    let app :Express;
    this.beforeEach(function(){
      app = express();
      app.get("/", (req, res)=>{
        throw new InternalError("Internal Error");
      });
      app.use(errorHandlerMdw());
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
      app.locals.config = mockConfig;

      await request(app).get("/")
      .set("Accept", "text/html")
      .expect(500)
      .expect("Content-Type", "text/html; charset=utf-8")
      .expect(/^<!DOCTYPE html>/)
      .expect(/error-main/);
    });

    it("advertises the Bearer scheme (not Basic) on 401", async function(){
      //Basic auth was removed: a Basic challenge would point clients at a
      //mechanism authenticate.ts now ignores.
      let app :Express = express();
      app.get("/protected", ()=>{ throw new UnauthorizedError("nope"); });
      app.use(errorHandlerMdw());

      const res = await request(app).get("/protected")
      .set("Accept", "application/json")
      .expect(401);
      expect(res.headers).to.have.property("www-authenticate").match(/^Bearer /);
    });

    describe("client disconnects", function(){
      /**
       * Drives a real socket against `app` so the client can hang up mid-request,
       * which is the only way to reach the disconnect branch. Resolves once the
       * error middleware has run, so nothing here waits on a delay.
       */
      async function abortRequest(build :(app:Express, onBodyChunk:()=>void)=>void){
        let sawChunk :()=>void, handled :()=>void;
        const bodyStarted = new Promise<void>(resolve=>{ sawChunk = resolve; });
        const errorHandled = new Promise<void>(resolve=>{ handled = resolve; });

        const app = express();
        build(app, ()=>sawChunk());
        const mdw = errorHandlerMdw();
        app.use(function(err :any, req :Request, res :Response, next :NextFunction){
          //Call the real middleware, then signal that it has returned
          mdw(err, req, res, next);
          handled();
        });

        const server = http.createServer(app);
        const capture = captureLogs();
        try{
          server.listen(0);
          await once(server, "listening");
          const {port} = server.address() as AddressInfo;

          const req = http.request({port, method: "PUT", path: "/upload",
            //Promise a body far longer than what we actually send
            headers: {"Content-Length": "1000000"}});
          req.on("error", ()=>{}); //The abort surfaces here too. Not what we're testing.
          req.write("x".repeat(1024));

          await bodyStarted; //The server is reading the body...
          req.destroy();     //...and now the client goes away
          await errorHandled;
          await timers.setImmediate(); //let the log sink drain

          return capture.records.filter(r=>r.module === "http");
        }finally{
          capture.stop();
          server.close();
        }
      }

      it("doesn't report a client hanging up as a server error", async function(){
        //An upload cut short used to resolve to a 500: it was logged as a server
        //fault and answered on a socket that was already gone. It accounted for
        //25 of the 36 error-level http lines observed in production over 15 days.
        const records = await abortRequest((app, onBodyChunk)=>{
          app.put("/upload", (req, res, next)=>{
            pipeline(
              req,
              async function*(source){ for await (const chunk of source){ onBodyChunk(); yield chunk; } },
              new Writable({write(_chunk, _enc, cb){ cb(); }}),
            ).then(()=>res.status(201).send("Created"), next);
          });
        });

        expect(records.filter(r=>r.level === "error"), "a client disconnect is not a server fault").to.have.length(0);
        expect(records.filter(r=>r.level === "warn"), "and it isn't an anomaly either").to.have.length(0);
        expect(records.map(r=>r.msg)).to.deep.equal(["Client disconnected before a response was sent"]);
      });

      it("still reports an upstream ECONNRESET as a server error", async function(){
        //The disconnect branch keys on the state of the connection, not on the error
        //code: a connection dropped by postgres or by the mail relay reports the very
        //same ECONNRESET and must keep its 500.
        const app = express();
        app.get("/", ()=>{
          const err :any = new Error("read ECONNRESET");
          err.code = "ECONNRESET";
          throw err;
        });
        app.use(errorHandlerMdw());

        const capture = captureLogs();
        try{
          await request(app).get("/").expect(500);
          await timers.setImmediate();
          const errors = capture.records.filter(r=>r.module === "http" && r.level === "error");
          expect(errors).to.have.length(1);
          expect(errors[0]).to.have.nested.property("err.code", "ECONNRESET");
        }finally{
          capture.stop();
        }
      });
    });

    it("handles errors (headers sent)", async function(){
      //It's necessarily imperfect, but if headers have already been sent, we just destroy the socket.
      let app :Express = express();
      app.get("/headers", (req, res)=>{
        res.writeHead(200);
        throw new InternalError("FOO");
      });

      app.use(errorHandlerMdw());

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
    app.locals.config = mockConfig;

    await request(app).get("/foo")
    .set("Accept", "text/html")
    .expect(404)
    .expect("Content-Type", "text/html; charset=utf-8")
    .expect(/^<!DOCTYPE html>/)
    .expect(/error-main/);
  });

  it("use default content type", async function(){
    await request(app).get("/foo")
    .set("Accept", "application/zip")
    .expect(404)
    .expect("Content-Type", "text/plain; charset=utf-8");
    //Not testing text/html output because it requires working templates
  });

});
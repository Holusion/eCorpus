import express, { Express, NextFunction, Request, RequestHandler, Response } from "express";
import request from "supertest";
import { InternalError, UnauthorizedError } from "./errors.js";
import { either, validateRedirect } from "./locals.js";

//Dummy middlewares
function pass(req :Request, res :Response, next :NextFunction){
  next();
}

function fail(req :Request, res :Response, next :NextFunction){
  next(new UnauthorizedError());
}

function err(req :Request, res :Response, next :NextFunction){
  next(new InternalError());
}

function h(req:Request, res:Response){
  res.status(204).send();
}

describe("either() middleware", function(){
  let app :Express;
  let handler :RequestHandler;
  this.beforeEach(function(){
    app = express();
    //small trick to allow error handling : 
    process.nextTick(()=>{
      app.use((err:Error, req :Request, res:Response, next :NextFunction)=>{
        res.status((err as any).code ?? 500).send(err.message);
      });
    });
  });

  it("checks each middleware for a pass", async function(){
    app.get("/", either(fail, fail, pass), h);
    await request(app).get("/").expect(204);
  });

  it("uses first middleware to pass", async function(){
    app.get("/", either(pass, fail), h);
    await request(app).get("/").expect(204);
  });

  it("doesn't allow errors other than UnauthoriezError", async function(){
    app.get("/", either(fail, err), h);
    await request(app).get("/").expect(500);
  });

  it("throws if no middleware passed", async function(){
    app.get("/", either(fail, fail), h);
    await request(app).get("/").expect(401);
  });

  it("is indempotent", async function(){
    app.get("/", either(pass, fail), h);
    const agent = request.agent(app);
    await agent.get("/").expect(204);
    await agent.get("/").expect(204);
  });
});

describe("validateRedirect()", function(){
  let app :Express;
  this.beforeEach(function(){
    app = express();
    app.get("/", (req, res, next)=>{
      try{
        let r = validateRedirect(req, req.query.redirect as any);
        res.status(302).set("Location", r.toString()).send(r.toString());
      }catch(e:any){
        res.status(500).send(e.message);
      }
    })
  });

  it("Absolute URL", async function(){
    let res = await request(app).get(`/?redirect=${encodeURIComponent("/ui/")}`).expect(302);
    expect(res.text).to.be.ok
  });
  it("Rejects domain change", async function(){
    let res = await request(app).get(`/?redirect=${encodeURIComponent("https://example.com/foo")}`).expect(500);
    expect(res.text).to.equal("[400] Bad Redirect parameter");
  });

  it("with trust proxy", async function(){
    app.set("trust proxy", true);
    let res = await request(app).get(`/?redirect=${encodeURIComponent("/foo")}`)
    .set("X-Forwarded-Host", "example.com")
    .expect(302);
    expect(res.text).to.equal("http://example.com/foo");
  });

  it("Canonical URL", async function(){
    app.set("trust proxy", true);
    let res = await request(app).get(`/?redirect=${encodeURIComponent("http://example.com/foo")}`)
    .set("X-Forwarded-Host", "example.com")
    .expect(302);
    expect(res.text).to.equal("http://example.com/foo");
  });

  it("Bad Canonical URL", async function(){
    app.set("trust proxy", true);
    let res = await request(app).get(`/?redirect=${encodeURIComponent("http://something.com/foo")}`)
    .set("X-Forwarded-Host", "example.com")
    .expect(500);
    expect(res.text).to.equal("[400] Bad Redirect parameter");
  });

})
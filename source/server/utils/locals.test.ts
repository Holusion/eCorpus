import express, { Express, NextFunction, Request, RequestHandler, Response } from "express";
import request from "supertest";
import { InternalError, UnauthorizedError } from "./errors.js";
import { either } from "./locals.js";

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
});
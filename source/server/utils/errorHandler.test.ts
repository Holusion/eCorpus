import { expect } from "chai";
import express, { Express, NextFunction, Request, Response } from "express";
import request from "supertest";
import { errorHandlerMdw, LogLevel } from "./errorHandler.js";
import { InternalError } from "./errors.js";


describe("errorHandler middleware", function(){
    let app :Express;
    this.beforeEach(function(){
      app = express();
    })

    it("handles errors", async function(){
      let app :Express = express();
      app.get("/", (req, res)=>{
        res.status(500).send("Internal Error");
      });
  
      app.use(errorHandlerMdw({isTTY:false, logLevel: LogLevel.Quiet}));
  
      
      await request(app).get("/")
      .set("Accept", "text/plain")
      .expect(500)
      .expect(/Internal Error/);
    })

    it("handles errors (headers sent)", async function(){
      //It's necessarily imperfect, but if headers have already been sent, we just destroy the socket.
      let app :Express = express();
      app.get("/", (req, res)=>{
        res.writeHead(200);
        throw new InternalError("FOO");
      });
  
      app.use(errorHandlerMdw({isTTY:false, logLevel: LogLevel.Quiet}));
  
      
      await expect(request(app).get("/")
      .set("Accept", "text/plain")
      .expect(200)).to.be.rejectedWith("socket hang up");
    });
  
})
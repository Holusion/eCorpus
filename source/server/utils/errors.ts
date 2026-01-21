import util from "node:util";
import { NextFunction, Request, Response } from "express";
import { useTemplateProperties } from "./locals.js";


export class HTTPError extends Error{
  public name = "HTTPError";
  constructor(public code :number, message :string){
    super(`[${code}] ${message}`);
  }
}

export class BadRequestError extends HTTPError{
  constructor(reason :string ="Bad Request"){
    super(400, reason);
  }
}
export class UnauthorizedError extends HTTPError{
  constructor(reason :string ="Unauthorized"){
    super(401, reason);
  }
}

export class ForbiddenError extends HTTPError{
  constructor(reason :string="Forbidden"){
    super(403, reason);
  }
}

export class NotFoundError extends HTTPError {
  constructor(reason :string="Not Found"){
    super(404, reason);
  }
}

export class MethodNotAllowedError extends HTTPError{
  constructor(reason :string = "Method Not Allowed"){
    super(405, reason);
  }
}

export class ConflictError extends HTTPError {
  constructor(reason :string="Conflict"){
    super(409, reason);
  }
}

export class LengthRequiredError extends HTTPError{
  constructor(reason: string = "Length Required"){
    super(411, reason);
  }
}

export class RangeNotSatisfiableError extends HTTPError {
  constructor(reason :string="Range Not Satisfiable"){
    super(416, reason);
  }
}

export class InternalError extends HTTPError {
  constructor(reason :string="Internal Server Error"){
    super(500, reason);
  }
}

export class NotImplementedError extends HTTPError{
  constructor(reason :string="Not Implemented"){
    super(501, reason);
  }
}
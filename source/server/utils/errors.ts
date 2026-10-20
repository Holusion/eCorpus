import { Localized, LocalizedData } from "./i18n.js";


export class HTTPError extends Error{
  /** Set when the message was {@link localize}d. Kept as plain data so it survives task output serialization */
  i18n?: LocalizedData;
  constructor(public code :number, message :string|Localized){
    super(`[${code}] ${message}`);
    if(message instanceof Localized) this.i18n = message.toData();
  }
}

export class BadRequestError extends HTTPError{
  constructor(reason :string|Localized ="Bad Request"){
    super(400, reason);
  }
}
export class UnauthorizedError extends HTTPError{
  constructor(reason :string|Localized ="Unauthorized"){
    super(401, reason);
  }
}

export class ForbiddenError extends HTTPError{
  constructor(reason :string|Localized="Forbidden"){
    super(403, reason);
  }
}

export class NotFoundError extends HTTPError {
  constructor(reason :string|Localized="Not Found"){
    super(404, reason);
  }
}

export class MethodNotAllowedError extends HTTPError{
  constructor(reason :string|Localized = "Method Not Allowed"){
    super(405, reason);
  }
}

export class ConflictError extends HTTPError {
  constructor(reason :string|Localized="Conflict"){
    super(409, reason);
  }
}

export class LengthRequiredError extends HTTPError{
  constructor(reason: string|Localized = "Length Required"){
    super(411, reason);
  }
}

export class PreconditionFailedError extends HTTPError {
  constructor(reason :string|Localized="Precondition Failed"){
    super(412, reason);
  }
}

export class RangeNotSatisfiableError extends HTTPError {
  constructor(reason :string|Localized="Range Not Satisfiable"){
    super(416, reason);
  }
}

export class InternalError extends HTTPError {
  constructor(reason :string|Localized="Internal Server Error"){
    super(500, reason);
  }
}

export class NotImplementedError extends HTTPError{
  constructor(reason :string|Localized="Not Implemented"){
    super(501, reason);
  }
}
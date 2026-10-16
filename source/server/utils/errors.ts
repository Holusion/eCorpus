import { apiMessage, formatMessage, type ApiMessage } from "./messages/index.js";


export class HTTPError extends Error{
  public readonly messageCode?: string;
  public readonly messageParams?: ApiMessage["messageParams"];
  constructor(public code :number, message :string | ApiMessage){
    super(`[${code}] ${typeof message === "string" ? message : formatMessage(message)}`);
    if (typeof message !== "string") {
      this.messageCode = message.messageCode;
      this.messageParams = message.messageParams;
    }
  }
}

export class BadRequestError extends HTTPError{
  constructor(reason :string | ApiMessage = apiMessage("http.bad-request")){
    super(400, reason);
  }
}
export class UnauthorizedError extends HTTPError{
  constructor(reason :string | ApiMessage = apiMessage("http.unauthorized")){
    super(401, reason);
  }
}

export class ForbiddenError extends HTTPError{
  constructor(reason :string | ApiMessage = apiMessage("http.forbidden")){
    super(403, reason);
  }
}

export class NotFoundError extends HTTPError {
  constructor(reason :string | ApiMessage = apiMessage("http.not-found")){
    super(404, reason);
  }
}

export class MethodNotAllowedError extends HTTPError{
  constructor(reason :string | ApiMessage = apiMessage("http.method-not-allowed")){
    super(405, reason);
  }
}

export class ConflictError extends HTTPError {
  constructor(reason :string | ApiMessage = apiMessage("http.conflict")){
    super(409, reason);
  }
}

export class LengthRequiredError extends HTTPError{
  constructor(reason: string | ApiMessage = apiMessage("http.length-required")){
    super(411, reason);
  }
}

export class PreconditionFailedError extends HTTPError {
  constructor(reason :string | ApiMessage = apiMessage("http.precondition-failed")){
    super(412, reason);
  }
}

export class RangeNotSatisfiableError extends HTTPError {
  constructor(reason :string | ApiMessage = apiMessage("http.range-not-satisfiable")){
    super(416, reason);
  }
}

export class InternalError extends HTTPError {
  constructor(reason :string | ApiMessage = apiMessage("http.internal-error")){
    super(500, reason);
  }
}

export class NotImplementedError extends HTTPError{
  constructor(reason :string | ApiMessage = apiMessage("http.not-implemented")){
    super(501, reason);
  }
}
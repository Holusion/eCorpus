import { localize, Localized, LocalizedData } from "./i18n.js";


export class HTTPError extends Error{
  /** Set when the message was {@link localize}d. Kept as plain data so it survives task output serialization */
  i18n?: LocalizedData;
  constructor(public code :number, message :string|Localized){
    super(`[${code}] ${message}`);
    if(message instanceof Localized) this.i18n = message.toData();
  }
}

export class BadRequestError extends HTTPError{
  constructor(reason :string|Localized =localize("errors.badRequest")){
    super(400, reason);
  }
}
export class UnauthorizedError extends HTTPError{
  constructor(reason :string|Localized =localize("errors.unauthorized")){
    super(401, reason);
  }
}

export class ForbiddenError extends HTTPError{
  constructor(reason :string|Localized=localize("errors.forbidden")){
    super(403, reason);
  }
}

export class NotFoundError extends HTTPError {
  constructor(reason :string|Localized=localize("errors.notFound")){
    super(404, reason);
  }
}

export class MethodNotAllowedError extends HTTPError{
  constructor(reason :string|Localized =localize("errors.methodNotAllowed")){
    super(405, reason);
  }
}

export class ConflictError extends HTTPError {
  constructor(reason :string|Localized=localize("errors.conflict")){
    super(409, reason);
  }
}

export class LengthRequiredError extends HTTPError{
  constructor(reason: string|Localized =localize("errors.lengthRequired")){
    super(411, reason);
  }
}

export class PreconditionFailedError extends HTTPError {
  constructor(reason :string|Localized=localize("errors.preconditionFailed")){
    super(412, reason);
  }
}

export class RangeNotSatisfiableError extends HTTPError {
  constructor(reason :string|Localized=localize("errors.rangeNotSatisfiable")){
    super(416, reason);
  }
}

export class InternalError extends HTTPError {
  constructor(reason :string|Localized=localize("errors.internalServerError")){
    super(500, reason);
  }
}

export class NotImplementedError extends HTTPError{
  constructor(reason :string|Localized=localize("errors.notImplemented")){
    super(501, reason);
  }
}
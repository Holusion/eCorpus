import { Request, Response } from "express";

import { ApiToken } from "../../auth/UserManager.js";
import { BadRequestError, ForbiddenError, UnauthorizedError } from "../../utils/errors.js";
import { getAuthMethod, getUser, getUserManager } from "../../utils/locals.js";

export function serializeToken(t: ApiToken){
  return {
    id: t.id,
    uid: t.uid,
    name: t.name,
    scope: t.scope,
    client: t.clientName ?? null,
    created: t.created.toISOString(),
    expires: t.expires ? t.expires.toISOString() : null,
    lastUsed: t.lastUsed ? t.lastUsed.toISOString() : null,
  };
}

/**
 * List the requester's own API tokens. Only metadata: secrets are not stored.
 */
export async function getOwnTokens(req: Request, res: Response){
  const requester = getUser(req)!;
  const tokens = await getUserManager(req).getTokens(requester.uid);
  res.status(200).send(tokens.map(serializeToken));
}

/**
 * Create a personal access token.
 * The token string is in the response — and nowhere else, ever again.
 */
export async function postToken(req: Request, res: Response){
  const requester = getUser(req)!;
  if(getAuthMethod(res) === "token"){
    //An exfiltrated token must not be able to mint fresh credentials for itself
    throw new ForbiddenError(`Tokens can not be used to create other tokens`);
  }
  const {name, scope, expires} = req.body ?? {};
  let expiresDate: Date | null = null;
  if(expires != null){
    expiresDate = new Date(expires);
    if(Number.isNaN(expiresDate.valueOf())) throw new BadRequestError(`Invalid expires date: ${expires}`);
  }
  const {token, meta} = await getUserManager(req).createToken(requester.uid, {
    name,
    scope,
    expires: expiresDate,
  });
  res.status(201).send({...serializeToken(meta), token});
}

/**
 * Revoke one of one's own tokens
 */
export async function deleteOwnToken(req: Request, res: Response){
  const requester = getUser(req)!;
  const id = parseInt(req.params.id, 10);
  if(Number.isNaN(id)) throw new BadRequestError(`Invalid token id: ${req.params.id}`);
  await getUserManager(req).removeToken(id, requester.uid);
  res.status(204).send();
}

/**
 * List any user's tokens (admin inventory)
 */
export async function getUserTokens(req: Request, res: Response){
  const uid = parseInt(req.params.uid, 10);
  if(Number.isNaN(uid)) throw new BadRequestError(`Invalid uid: ${req.params.uid}`);
  const tokens = await getUserManager(req).getTokens(uid);
  res.status(200).send(tokens.map(serializeToken));
}

/**
 * Revoke any user's token (admin)
 */
export async function deleteUserToken(req: Request, res: Response){
  const uid = parseInt(req.params.uid, 10);
  const id = parseInt(req.params.id, 10);
  if(Number.isNaN(uid) || Number.isNaN(id)) throw new BadRequestError(`Invalid token reference`);
  await getUserManager(req).removeToken(id, uid);
  res.status(204).send();
}

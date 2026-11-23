import { Request } from "express";

import { getTaskScheduler, getUser } from "../../utils/locals.js";
import { BadRequestError, NotFoundError, UnauthorizedError } from "../../utils/errors.js";
import { TaskDefinition } from "../../tasks/types.js";
import { parseUserUpload, UploadHandlerParams, ParsedUserUpload } from "../../tasks/handlers/uploads.js";

export function isUploadTask(t: TaskDefinition<any>): t is TaskDefinition<UploadHandlerParams, ParsedUserUpload> {
  return t.type === parseUserUpload.name;
}

/**
 * The upload `:id` of a request, which must belong to the requester
 * @throws {NotFoundError} if there is no upload with this id
 * @throws {UnauthorizedError} if it belongs to someone else
 */
export async function getOwnUpload(req: Request): Promise<TaskDefinition<UploadHandlerParams, ParsedUserUpload>> {
  const id = parseInt(req.params.id);
  const requester = getUser(req)!;
  const task = await getTaskScheduler(req).getTask(id);
  if (!isUploadTask(task)) {
    throw new NotFoundError(`No upload with id ${id}`);
  }
  if (task.user_id !== requester.uid) {
    throw new UnauthorizedError(`This upload does not belong to this user`);
  }
  return task;
}

/**
 * The path of a file of an upload, from a `*path` route parameter
 */
export function getUploadFileParam(req: Request): string {
  const p: unknown = (req.params as any).path;
  const filepath = Array.isArray(p) ? p.join("/") : p;
  if (typeof filepath !== "string" || !filepath) throw new BadRequestError(`A file path is required`);
  return filepath;
}

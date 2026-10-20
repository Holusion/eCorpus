import { Request, Response } from "express";
import { getLanguage, getLocals } from "../../../utils/locals.js";
import { translateTaskOutput } from "../../../utils/i18n.js";
import { TaskDefinition, TaskDataPayload, TaskLogEntry } from "../../../tasks/types.js";

export interface TaskResponse<TData extends TaskDataPayload = TaskDataPayload, TReturn = any> {
  task: TaskDefinition<TData, TReturn>;
  logs: TaskLogEntry[];
}

/**
 * Translates the output of a task (and of its children, for task trees) to the client's language.
 * @see translateTaskOutput for what gets translated
 */
export function translateTask<T extends TaskDefinition & { children?: T[] }>(req: Request, res: Response, task: T): T {
  res.vary("Accept-Language");
  const lng = getLanguage(req);
  const translate = (t: T): T => {
    const output = translateTaskOutput(t.status, t.output, lng);
    if (output !== t.output) res.set("Content-Language", lng);
    return {
      ...t,
      output,
      ...(t.children ? { children: t.children.map(translate) } : {}),
    };
  };
  return translate(task);
}

export async function getTask(req: Request, res: Response) {
  //Read authorization is enforced by the route's policy({access:"read", on:"task"}) guard.
  const { taskScheduler } = getLocals(req);
  const { id: idString } = req.params;
  const id = parseInt(idString);
  const task = await taskScheduler.getTask(id);
  const logs = await taskScheduler.getLogs(id);
  res.status(200).send({ task: translateTask(req, res, task), logs });
}

import type { TaskManager } from "../tasks/manager.js";
import type { TaskDefinition } from "../tasks/types.js";
import type Vfs from "../vfs/index.js";
import { createLogger } from "../utils/log/index.js";
import { i18n, LocalizedData, localizedOutputKeys, translateErrorMessage, translateTaskOutput } from "../utils/i18n.js";
import { NotificationItem } from "./types.js";
import { stateOf } from "./messages.js";

const log = createLogger("notifications");

/** A scene that came out of a task, and how to go and see it */
export interface OutcomeScene {
  name: string;
  /** Voyager scenes can be edited */
  editable: boolean;
  /** What happened to it, if that's to be told: created, updated */
  action?: string;
}

/** A line of what came out of a task: something to read, or a scene */
export type OutcomeLine = { text: string, error?: boolean } | { scene: OutcomeScene };

/**
 * What came out of a notification's task, as pages of notifications show it, under what the notification says.
 * Its first line is what it's about: when there's more, the rest is out of sight until it's asked for.
 * Not in the bell's panel, nor in the stream: pages ask for it as they draw their lines, in their language.
 */
export interface Outcome {
  first: OutcomeLine;
  rest: OutcomeLine[];
}

export interface OutcomeContext {
  tasks: Pick<TaskManager, "getTask">;
  vfs: Pick<Vfs, "getScene">;
  lng: string;
}

/** It may have gone since */
async function sceneOf(vfs: OutcomeContext["vfs"], key: string|number, action?: string): Promise<OutcomeLine|null>{
  try{
    const scene = await vfs.getScene(key);
    return {scene: {name: scene.name, editable: scene.type === "voyager", ...(action ? {action} : {})}};
  }catch(e: any){
    log.debug({ scene: key, err: e }, "A scene made by a task is gone");
    return null;
  }
}

/** What successful tasks of a type tell, beyond their messages */
const successes: Record<string, (task: TaskDefinition, ctx: OutcomeContext)=> Promise<OutcomeLine[]>> = {
  async createSceneFromFiles(task, {vfs}){
    if(typeof task.output !== "number") return [];
    const scene = await sceneOf(vfs, task.output);
    return scene ? [scene] : [];
  },
  /** How many scenes, then each, with what happened to it. A single one is told as it is. */
  async extractScenesArchives(task, {vfs, lng}){
    if(!Array.isArray(task.output)) return [];
    const scenes: OutcomeLine[] = [];
    for(const {name, action} of task.output as Array<{name: string, action: "create"|"update"}>){
      const scene = await sceneOf(vfs, name, i18n.t(action === "update" ? "notifications.upload.updated" : "notifications.upload.created", {lng}));
      if(scene) scenes.push(scene);
    }
    if(scenes.length <= 1) return scenes;
    return [{text: i18n.t("notifications.upload.scenesImported", {lng, count: scenes.length})}, ...scenes];
  },
};

/** The messages of a task's output, if it has any (see utils/i18n.ts): any task can tell something this way */
function messagesOf(task: TaskDefinition, lng: string): OutcomeLine[]{
  const output = translateTaskOutput(task.status, task.output, lng) as Record<string, unknown>|null;
  const lines: OutcomeLine[] = [];
  for(const key of localizedOutputKeys){
    const list = output?.[key];
    if(!Array.isArray(list)) continue;
    for(const entry of list as Array<LocalizedData & {message?: string}>){
      if(typeof entry?.message === "string") lines.push({text: entry.message});
    }
  }
  return lines;
}

/**
 * What came out of a notification's task, if there's anything to tell: why it failed, or what it made.
 * Nothing while it's running, nor for what isn't about a task.
 */
export async function outcomeOf(item: NotificationItem, ctx: OutcomeContext): Promise<Outcome|undefined>{
  if(item.task_id === null || stateOf(item) === "running") return undefined;
  let task: TaskDefinition;
  try{
    task = await ctx.tasks.getTask(item.task_id);
  }catch(e: any){
    log.warn({ task_id: item.task_id, err: e }, "Can't get the task of a notification");
    return undefined;
  }
  let lines: OutcomeLine[] = [];
  if(task.status === "error"){
    if(typeof task.output?.message === "string") lines = [{text: translateErrorMessage(task.output, ctx.lng), error: true}];
  }else if(task.status === "success"){
    lines = [...await (successes[task.type]?.(task, ctx) ?? Promise.resolve([])), ...messagesOf(task, ctx.lng)];
  }
  const [first, ...rest] = lines;
  return first ? {first, rest} : undefined;
}

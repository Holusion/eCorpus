import { Router, Request } from "express";
import { getLanguage, getLocals, getUser, getVfs, mapScene, numericParam, policy } from "../../utils/locals.js";
import { outcomeLinesOf } from "../../notifications/outcomes.js";
import { LogSeverity, TaskDefinition, TaskNode } from "../../tasks/types.js";
import { translateErrorMessage } from "../../utils/i18n.js";

/**
 * The pages of tasks, as /ui/tasks/*
 */
const routes = Router();

/**
 * The pages of a task: its overview, its logs and its data, under the same title and sidebar (see layouts/task.hbs).
 * Whoever can read a task can see them all: see policy({on: "task"}).
 */
const taskPolicy = [numericParam("id"), policy({ access: "read", on: "task" })];

/** What every page of a task shows, from its tree with the logs at `level` and up */
async function taskPage(req: Request, level: LogSeverity){
  const {taskScheduler, userManager, vfs} = getLocals(req);
  const requester = getUser(req);
  const id = parseInt(req.params.id);
  const {root, logs} = await taskScheduler.getTaskTree(id, {level});

  /** Names of the owners of the task and those under it, which are most often the same */
  const owners = new Map<number, Promise<string|null>>();
  const ownerOf = (user_id: number|null|undefined)=>{
    if(user_id == null) return Promise.resolve(null);
    if(user_id === requester?.uid) return Promise.resolve(requester.username);
    if(!owners.has(user_id)) owners.set(user_id, userManager.getUserById(user_id).then(u=> u.username, ()=> null));
    return owners.get(user_id)!;
  };
  /** As lists of tasks show them (see partials/taskRow.hbs) */
  type Row = TaskNode & {owner: string|null};
  const withOwners = async (node: TaskNode): Promise<Row>=> ({
    ...node,
    owner: await ownerOf(node.user_id),
    children: await Promise.all(node.children.map(withOwners)),
  });

  return {
    root: await withOwners(root),
    logs,
    scene: root.scene_id ? (await vfs.getScene(root.scene_id)).name : null,
    layout: "task",
    title: `Task #${id} — ${root.type}`,
  };
}

/** Data as one line, cut if it's long: the whole of it is in the data page */
function dataLine(data: unknown): string{
  const line = JSON.stringify(data) ?? "";
  return line.length > 200 ? `${line.slice(0, 200)}…` : line;
}

/** Whether a task's output is an error, which its status doesn't always tell (see tasks/errors.ts) */
function isErrorOutput(output: TaskDefinition["output"]){
  return !!output && typeof output === "object" && typeof output.name === "string" && output.name.indexOf("Error") !== -1;
}

routes.get("/:id", ...taskPolicy, async (req, res) => {
  const page = await taskPage(req, "warn");
  const {root} = page;
  const requester = getUser(req);
  const vfs = getVfs(req);
  const lng = getLanguage(req);
  const lines = await outcomeLinesOf(root, {vfs, lng});
  //Scenes are shown as everywhere else, with what can be done with them
  const scenes = (await Promise.all(lines.flatMap(l=> "scene" in l ? [l.scene.name] : []).map(name=>
    vfs.getScene(name, requester?.uid).then(s=> mapScene(req, s), ()=> null)
  ))).filter(s=> s !== null);
  res.render("task/overview", {
    ...page,
    reason: lines.find(l=> "text" in l && l.error),
    messages: lines.filter(l=> "text" in l && !l.error),
    scenes,
    //Logs are fetched from warnings up: those are what's worth telling
    warnCount: page.logs.length,
    //What's under it is part of what it did: in sight
    openTaskRows: true,
  });
});

routes.get("/:id/logs", ...taskPolicy, async (req, res) => {
  const validLevels = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
  const rawLevel = req.query.level as string | undefined;
  const level: LogSeverity = (validLevels as readonly string[]).includes(rawLevel ?? "") ? rawLevel as LogSeverity : "info";
  const page = await taskPage(req, level);
  const {root} = page;
  const lng = getLanguage(req);
  res.render("task/logs", {
    ...page,
    level,
    input: dataLine(root.data),
    //Nothing while it hasn't any: a running task, or one that returns nothing
    output: root.output == null ? null
      : root.status === "error" && typeof root.output?.message === "string" ? translateErrorMessage(root.output, lng)
      : dataLine(root.output),
  });
});

routes.get("/:id/data", ...taskPolicy, async (req, res) => {
  const page = await taskPage(req, "fatal");
  const {root} = page;
  /** Data as it's shown: its first lines, and the rest when it's asked for */
  const block = (text: string)=> ({text, long: text.split("\n").length > 8});
  const outputType = root.output == null ? "undefined" : isErrorOutput(root.output) ? "error" : typeof root.output;
  res.render("task/data", {
    ...page,
    input: block(JSON.stringify(root.data, null, 2)),
    output: outputType === "error" ? block(root.output.stack ?? root.output.message ?? "")
      : block(JSON.stringify(root.output, null, 2) ?? ""),
    outputType,
  });
});


export default routes;

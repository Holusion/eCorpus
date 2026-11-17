import { Router } from "express";
import { getLocals, getUser, numericParam, policy } from "../../utils/locals.js";

/**
 * A task's page, as /ui/tasks/*
 */
const routes = Router();

routes.get("/:id", numericParam("id"), policy({ access: "read", on: "task" }), async (req, res) => {
  const {
    taskScheduler,
    userManager,
    vfs,
  } = getLocals(req);
  const requester = getUser(req);
  const id = parseInt(req.params.id);
  const validLevels = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
  type Level = typeof validLevels[number];
  const rawLevel = req.query.level as string | undefined;
  const level: Level = (validLevels as readonly string[]).includes(rawLevel ?? "") ? rawLevel as Level : "info";
  const {root, logs} = await taskScheduler.getTaskTree(id, {level});

  // Logs at severity >= warn, regardless of the UI filter.
  // When the displayed list filters above warn (level error/fatal), warn lines
  // are missing and we need a separate fetch to count them.
  const warnAlreadyVisible = level === "trace" || level === "debug" || level === "info" || level === "warn";
  const warnCount = warnAlreadyVisible
    ? logs.filter(l => l.severity === "warn" || l.severity === "error" || l.severity === "fatal").length
    : (await taskScheduler.getTaskTree(id, {level: "warn"})).logs.length;

  const owner = root.user_id? (root.user_id == requester?.uid ?requester.username :(await userManager.getUserById(root.user_id)).username):null;
  const scene = root.scene_id? (await vfs.getScene(root.scene_id)).name : null;
  let taskOutputType:string = typeof root.output;
  if(taskOutputType === "object" && root.output
    && typeof root.output.name === "string" 
    && root.output.name.indexOf("Error") != -1){
      taskOutputType = "error";
  }

  res.render("task", {
    title: `Task #${id} — ${root.type}`,
    root,
    taskData: JSON.stringify(root.data, null, 2),
    taskOutput: JSON.stringify(root.output, null, 2),
    taskOutputType,
    logs,
    warnCount,
    level,
    owner,
    scene,
  });
});

export default routes;

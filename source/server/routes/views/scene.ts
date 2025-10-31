import path from "node:path";
import { Router, Request, Response,  } from "express";
import wrap from "../../utils/wrapAsync.js";
import { canRead, getHost, canWrite, getSession, getVfs, getUser, getLocals, canAdmin } from "../../utils/locals.js";
import { Scene } from "../../vfs/index.js";
import { BadRequestError, InternalError } from "../../utils/errors.js";
import { queryToPage } from "../../utils/query.js";
import { TasksTreeNode } from "../../tasks/scheduler.js";
import { TaskStatus } from "../../tasks/types.js";



export function mapScene(req :Request, {thumb, name, ...s}:Scene):Scene{
  if(thumb){
    thumb = new URL(path.join("/scenes/", encodeURIComponent(name), encodeURIComponent(thumb)), getHost(req)).toString();
  }
  return {thumb, name, ...s};
}

const router = Router();

//Ensure no unauthorized access
//Additionally, sets res.locals.access, required for the "scene" template
router.use("/:scene", canRead);

router.get("/:scene", wrap(async (req, res)=>{
  const requester = getUser(req);
  const {vfs, userManager:um, taskScheduler} = getLocals(req);
  const {scene:scene_name} = req.params;

  let scene = mapScene(req, await vfs.getScene(scene_name, requester? requester.uid: undefined));

  let [permissions, meta, serverTags, tasks] = await Promise.all([
    um.getPermissions(scene.id),
    vfs.getSceneMeta(scene_name),
    vfs.getTags(),
    taskScheduler.getTasks({scene_id: scene.id}),
  ]);

  const groupPermissions = permissions.filter((permission)=>("groupName" in permission));
  const userPermissions = permissions.filter((permission)=>("username" in permission));
  
  const tagSuggestions = serverTags.filter(t=>{
    let res = scene.tags.indexOf(t.name) === -1;
    return res;
  }).map(t=>t.name);

  let displayedTitle = meta.primary_title;
  let displayedIntro = meta.primary_intro;
  const language = getSession(req)?.lang;
  if (language !== undefined){
      if(meta.titles && language.toUpperCase() in meta.titles){
        displayedTitle = meta.titles[language.toUpperCase()];
      }
      if(meta.intros && language in meta.intros){
        displayedIntro = meta.intros[language.toUpperCase()];
      }
  }

  res.render("scene", {
    title: `eCorpus: ${scene.name}`,
    displayedTitle,
    displayedIntro,
    scene,
    meta,
    groupPermissions,
    userPermissions,
    tagSuggestions,
  });
}));

router.get("/:scene/view", (req, res)=>{
  let {scene} = req.params;
  let {lang, tour} = req.query;
  let host = getHost(req);
  let referrer = new URL(req.get("Referrer")||`/ui/scenes/`, host);
  let thumb = new URL(`/scenes/${encodeURIComponent(scene)}/scene-image-thumb.jpg`, host);
  
  let script = undefined;
  if(tour && !Number.isNaN(parseInt(tour as any))){
    script = `
      const v = document.querySelector("voyager-explorer");
      v?.on("model-load",()=>{
        v?.toggleTours();
        v?.setTourStep(${parseInt(tour as any)}, 0, true);
      })
    `;
  }


  res.render("explorer", {
    title: `${scene}: Explorer`,
    layout: "viewer",
    scene,
    thumb: thumb.toString(),
    referrer: referrer.toString(),
    script
  });
});


router.get("/:scene/edit", canWrite, (req, res)=>{
  let {scene} = req.params;
  let {mode="Edit"} = req.query;
  let host = getHost(req);
  let referrer = new URL(req.get("Referrer")||`/ui/scenes/`, host);
  let thumb = new URL(`/scenes/${encodeURIComponent(scene)}/scene-image-thumb.jpg`, host);

  res.render("story", {
    title: `${scene}: Story Editor`,
    layout: "viewer",
    scene,
    thumb: thumb.toString(),
    referrer: referrer.toString(),
    mode,
  });
});

router.get("/:scene/history", canWrite, wrap(async (req, res)=>{
  let vfs = getVfs(req);
  //scene_name is actually already validated through canAdmin
  let {scene:scene_name} = req.params;
  let scene = await vfs.getScene(scene_name);
  
  res.render("history", {
    title: `eCorpus: History of ${scene_name}`,
    name: scene_name,
    canAdmin: res.locals.access === "admin",
  });
}))

router.get("/:scene/history/:id/view", canWrite, wrap(async (req, res)=>{
  let vfs = getVfs(req);
  //scene_name is actually already validated through canAdmin
  let {scene:scene_name, id} = req.params;
  let scene = await vfs.getScene(scene_name);
  let thumb = new URL(`/scenes/${encodeURIComponent(scene_name)}/scene-image-thumb.jpg`, getHost(req));
  
  res.render("explorer", {
    title: `eCorpus: History of ${scene_name}`,
    layout: "viewer",
    scene: scene_name,
    thumb: thumb.toString(),
    referrer: `/ui/scenes/${scene.name}/history`,
    scenePath: `/history/${encodeURIComponent(scene.name)}/${encodeURIComponent(id)}/show/`,
  })
}));


type ResolvedNode = Omit<TasksTreeNode,"after"|"status">&{
  status: TaskStatus|"waiting";
  requirements: ResolvedNode[];
};

/**
 * Resolve every node's relations to point to the referenced task object
 */
function toResolved({after, ...node}:TasksTreeNode, refs:Map<number,TasksTreeNode>):ResolvedNode{
  const chainedNode = (typeof node.output === "number"?refs.get(node.output):null);

  let status :ResolvedNode["status"] = node.status;
  if(chainedNode && chainedNode.status !== "success"){
    status = "waiting";
  }

  if(chainedNode){
    after.push(chainedNode.task_id)
  }
  let requirements =  after.map(id=>{
    const node = refs.get(id)!
    return toResolved(node, refs);
  });

  let output = chainedNode? chainedNode.output: node.output;
  return {
    ...node,
    status,
    output,
    requirements,
  }
}

/**
 * Extract a flat map of `id->taskNode` for later reference
 * @returns 
 */
function listNodes(task: TasksTreeNode, m: Map<number, TasksTreeNode> = new Map()){
  m.set(task.task_id, task);
  task.children.forEach(n=> listNodes(n, m));
  return m;
}

router.get("/:scene/tasks/:id", canAdmin, wrap(async (req, res)=>{
  const {id:idString, scene} = req.params;
  const {taskScheduler} = getLocals(req);

  const id = parseInt(idString);
  if(!Number.isInteger(id) || id < 0) throw new BadRequestError(`Invalid task id : ${id}`);

  let task = await taskScheduler.getTask(id);

  //We rely on the root tree because a task can have relationships with ancestors
  const rootTree = await taskScheduler.getRootTree(id);


  const allTreeNodes = listNodes(rootTree);


  const tree = allTreeNodes.get(id);
  if(!tree) throw new InternalError(`Couldn't find task ${id} in root tree for ${rootTree.task_id}`);
  const requiredTree = toResolved(tree, allTreeNodes);

  res.render("task", {
    title: `eCorpus: task view`,
    scene: scene,
    groupStatus: tree.groupStatus,
    task,
    logs: await taskScheduler.getTaskLogs(id),
    output: JSON.stringify(requiredTree.output, null, 2),
    tree: requiredTree,
  });
}));


export default router;
import { Request, Response } from "express";
import { getVfs, getUser, getTaskScheduler } from "../../../../utils/locals.js";
import { MethodNotAllowedError, UnauthorizedError } from "../../../../utils/errors.js";

import fs from "fs/promises";
import path from "node:path";
import yazl from "yazl";
import { Dirent } from "node:fs";


export interface WorkspaceFileEntry {
  path: string;
  size: number;
  ctime: Date;
  mtime: Date;
}

async function collectWorkspaceFiles(dir: string, prefix: string): Promise<WorkspaceFileEntry[]> {
  const files: WorkspaceFileEntry[] = [];
  let dirents: Dirent[];
  try{
    dirents = await fs.readdir(dir, {withFileTypes: true});
  }catch(e: any){
    if(e.code !== "ENOENT") throw e;
    dirents = [];
  }
  for(const entry of dirents){
    const fullPath = path.join(dir, entry.name);
    const entryPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if(entry.isDirectory()){
      files.push(...await collectWorkspaceFiles(fullPath, entryPath));
    } else {
      const stat = await fs.stat(fullPath);
      files.push({ path: entryPath, size: stat.size, ctime: stat.ctime, mtime: stat.mtime });
    }
  }
  return files;
}


export async function getTaskArtifact(req: Request, res: Response){
  const vfs = getVfs(req);
  const taskScheduler = getTaskScheduler(req);
  const requester = getUser(req)!;
  const {id:idString} = req.params;
  const id = parseInt(idString);
  const task = await taskScheduler.getTask(id);
  if(task.user_id !== requester.uid){
    throw new UnauthorizedError(`This task does not belong to this user`);
  }
  if(task.status != 'success'){
    throw new MethodNotAllowedError(`Task status is ${task.status}. GET is only allowed on tasks that have status = "success"`);
  }

  const workspaceDir = vfs.getTaskWorkspace(id);
  const files = await collectWorkspaceFiles(workspaceDir, "");

  res.format({
    "application/zip": () =>{
      const zipFile = new yazl.ZipFile();
      for(const file of files){
        zipFile.addFile(path.join(workspaceDir, file.path), file.path);
      }
      zipFile.end();
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="task-${id}.zip"`);
      zipFile.outputStream.pipe(res);

    },
    "application/json": () => {
      res.status(200).send({ files });
    },
    default: ()=>{
      res.status(406).send("Not Acceptable");
    }
  });
}
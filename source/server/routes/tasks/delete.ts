import { Request, Response } from "express";
import { getLocals } from "../../utils/locals.js";
import { BadRequestError, NotFoundError } from "../../utils/errors.js";




export async function deleteTask(req: Request, res: Response){
  const {taskScheduler} = getLocals(req);
  const {id:idString} = req.params;

  const id = parseInt(idString);
  if(!Number.isInteger(id) || id <= 0){
    throw new BadRequestError(`Invalid ID parameter: ${idString}`);
  }
  let deleted = await taskScheduler.deleteTask(id);
  if(!deleted) throw new NotFoundError(`No task found with id ${id}`);
  res.status(204).send();
}
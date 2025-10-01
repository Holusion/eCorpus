
import { TaskListener, TaskListenerParams } from "./listener.js";

import { on } from "events";
import { TaskStatus, TaskType, TaskTypeData } from "./types.js";
import { InternalError, NotFoundError } from "../utils/errors.js";



export class TaskScheduler extends TaskListener{

  constructor({client}:TaskListenerParams){
    super({client});
  }

  async start(){
    await super.start(["success", "error"]);
  }

}

import { Client, Notification } from "pg";
import { DatabaseHandle, toHandle } from "../vfs/helpers/db.js";
import { TaskProcessorParams } from "./processor.js";
import { TaskListener } from "./listener.js";
import { TaskDefinition } from "./types.js";


export class TaskScheduler extends TaskListener{


  constructor({client}: TaskProcessorParams){
    super({client});
  }

  async start(){
    await super.start(["success", "error"]);
  }

}
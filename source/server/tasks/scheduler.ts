
import { TaskListener, TaskListenerParams } from "./listener.js";


export class TaskScheduler extends TaskListener{


  constructor({client}:TaskListenerParams){
    super({client});
  }

  async start(){
    await super.start(["success", "error"]);
  }

}
import EventEmitter from "node:events";
import { TaskData, TaskHandler, TaskPackage } from "./types.js";



interface WorkPackage<T extends TaskHandler=any>{
  work: TaskPackage<T>;
  resolve: (value: ReturnType<T>) => void;
  reject: (err: Error)=>void;
}


export class Queue{
  #queue: WorkPackage[] = [];
  #active = 0;
  #limit: number;
  #c = new AbortController();

  constructor(limit = Infinity) {
    this.#limit = limit;
  }


  /**
   * Adds a task to the queue.
   */
  add<T extends TaskHandler>(work: TaskPackage<T>):Promise<ReturnType<T>> {
    if(this.#c.signal.aborted){
      throw new Error(`Queue is closed. Can't add new tasks`);
    }
    return new Promise((resolve, reject) => {
      this.#queue.push({ work, resolve, reject });
      this.#processNext();
    });
  }

  #onSettled = ()=>{
    this.#active--;
    this.#processNext();
  }

  #processNext(){
    // Stop if we are busy or if the queue is empty
    if (this.#active >= this.#limit || this.#queue.length === 0 ) {
      return;
    }

    // 3. Dequeue the next task
    this.#active++;
    const { work, resolve, reject } = this.#queue.shift()!;

    Promise.resolve(work({signal: this.#c.signal}))
      .then(result => resolve(result))
      .catch(error => reject(error))
      .finally(this.#onSettled);
  }

  /**
   * Close the queue
   * @todo Add a more graceful close that waits for jobs to complete instead of cancelling
   */
  async close(){
    if(this.#c.signal.aborted){
      throw new Error(`Queue is already closed.`);
    }
    this.#c.abort();
    for (let item of this.#queue){
      item.reject(this.#c.signal.reason);
    }
    this.#queue = [];
    //@FIXME We do not actually wait for jobs to be cancelled!
    //Jobs that incompletely implement the cancellation interface could still complete after close().
  }
  
  // Optional getters for observability
  get pendingCount() { return this.#queue.length; }
  get activeCount() { return this.#active; }
}
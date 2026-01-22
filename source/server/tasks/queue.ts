import EventEmitter from "node:events";
import timers from "node:timers/promises";
import { TaskDataPayload, TaskHandler, TaskPackage } from "./types.js";



interface WorkPackage<T extends TaskHandler=any>{
  work: TaskPackage<T>;
  resolve: (value: ReturnType<T>) => void;
  reject: (err: Error)=>void;
}


export class Queue{
  #queue: WorkPackage[] = [];
  #active = 0;
  #c = new AbortController();
  #settleResolve: (() => void) | null = null;

  constructor(public limit = Infinity, public name?:string) {
  }

  toString(){
    return `Queue(${this.limit}, ${this.name || "anonymous"})`
  }


  /**
   * Adds a task to the queue.
   */
  add<T=any>(work: TaskPackage<T>):Promise<T> {
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
    // Notify waiters if all active tasks have completed
    if(this.#active === 0 && this.#settleResolve){
      this.#settleResolve();
      this.#settleResolve = null;
    }
    this.#processNext();
  }

  #processNext(){
    // Stop if we are busy or if the queue is empty
    if (this.#active >= this.limit || this.#queue.length === 0 ) {
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
   * Close the queue gracefully
   * Waits for active tasks to complete before aborting pending ones
   * @param timeoutMs Maximum time to wait for active tasks. Defaults to 30 seconds.
   */
  async close(timeoutMs: number = 1000){
    if(this.#c.signal.aborted){
      throw new Error(`Queue is already closed.`);
    }
    // Now abort and reject pending tasks
    this.#c.abort();
    //Empty the queue (work not yet started)
    for (let item of this.#queue){
      item.reject(this.#c.signal.reason ?? new Error("Queue closed"));
    }
    this.#queue = [];
    //Return immediately if no jobs are currently processed
    if(this.#active == 0) return;
    //Otherwise wait for timeout to let jobs resolve properly
    await new Promise<void>((resolve, reject)=>{
      const _t = setTimeout(()=>{
        this.#settleResolve = null;
        reject(new Error(`Queue close timeout: active tasks did not complete within ${timeoutMs}ms`));
      }, timeoutMs);
      this.#settleResolve = ()=>{
        clearTimeout(_t);
        resolve();
      };

    });

  }
  
  // Optional getters for observability
  get pendingCount() { return this.#queue.length; }
  get activeCount() { return this.#active; }
  get closed(){ return this.#c.signal.aborted; }
}
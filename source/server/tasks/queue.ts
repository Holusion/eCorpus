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
  /**
   * Pointer to the jobs currently running. Allows force-stop in close()
   */
  #current = new Set<WorkPackage>();
  #c = new AbortController();

  /**
   * Callback defined when queue is closing
   */
  #settleResolve: (() => void) | null = null;

  constructor(public limit = Infinity, public name?:string) {
  }

  toString(){
    return `Queue(${this.limit}, ${this.name || "anonymous"})`
  }


  /**
   * Adds a task to the queue.
   * The task will wait for an open slot before starting
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

  /**
   * Jumps the queue and start processing a job immediately
   * 
   * It is still counted in {@link Queue.activeCount}, but will ignore the queue's concurrency limit.
   */
  unshift<T=any>(work: TaskPackage<T>):Promise<T> {
    if(this.#c.signal.aborted){
      throw new Error(`Queue is closed. Can't add new tasks`);
    }
    return new Promise((resolve, reject) => {
      this.#run({ work, resolve, reject });
    });
  }

  #run(job: WorkPackage<any>){
    this.#current.add(job);

    //Execute the job. When it settles, check if it was interrupted before calling the resolvers
    Promise.resolve(job.work({signal: this.#c.signal}))
    .then(result => {
      if(this.#current.delete(job)) job.resolve(result);
    }, error =>{
      if(this.#current.delete(job)) job.reject(error);
    })
    .finally(()=>{
      // Notify waiters if all active tasks have completed
      if(this.#current.size === 0 && this.#settleResolve){
        this.#settleResolve();
        this.#settleResolve = null;
      }
      this.#processNext();
    });
  }

  #processNext(){
    // Stop if we are busy or if the queue is empty
    if (this.#current.size >= this.limit || this.#queue.length === 0 ) {
      return;
    }
    // 3. Dequeue the next task
    this.#run(this.#queue.shift()!);
  }

  /**
   * Close the queue gracefully
   * Waits for active tasks to complete before aborting pending ones
   * @param timeoutMs Maximum time to wait for active tasks. Defaults to 1 second.
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
    if(this.#current.size == 0) return;
    //Otherwise wait for timeout to let jobs resolve properly
    await new Promise<void>((resolve, reject)=>{
      const _t = setTimeout(()=>{
        this.#settleResolve = null;
        //Force-reject any running jobs
        for(let job of this.#current){
          job.reject(new Error(`Queue close timeout: task did not stop within ${timeoutMs}ms`));
        }
        this.#current.clear();
        resolve();
      }, timeoutMs);

      this.#settleResolve = ()=>{
        clearTimeout(_t);
        resolve();
      };

    });
  }
  /**
   * Number of jobs waiting for an execution slot
   */
  get pendingCount() { return this.#queue.length; }
  /**
   * Number of jobs currently being executed
   * It's possible to have `limit < activeCount` if {@link Queue.unshift} is used.
   */
  get activeCount() { return this.#current.size; }
  /** true if Queue has been closed */
  get closed(){ return this.#c.signal.aborted; }
}
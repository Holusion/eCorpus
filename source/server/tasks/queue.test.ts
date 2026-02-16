import timers from "node:timers/promises";
import { Queue } from "./queue.js";



describe("Queue", function(){
  let q: Queue;
  this.beforeEach(function(){
    q = new Queue();
  });
  describe("close()", function(){
    it("close enmpty queue", async function(){
      await q.close();
    });
    it("can't close twice", async function(){
      await q.close();
      await expect(q.close()).to.be.rejectedWith("already closed");
    });
    it("can't add jobs once closed", async function(){
      await q.close();
      //add() throws synchronously
      expect(()=>q.add(()=>Promise.resolve())).to.throw("Can't add new tasks");
    });

    it("cancels running jobs", async function(){
      let result: any;
      let _op = q.add(async ({signal})=>{
        try{
          await timers.setTimeout(1000, null, {signal})
          result = "ok";
        }catch(e: any){
          result = e.name;
          throw e;
        }
      }).catch(e=> e);

      //Shouldn't throw despite the task throwing an AbortError
      await q.close(100);
      expect(result).to.equal("AbortError");
      expect(await _op).to.have.property("name", "AbortError");
    })
    
    it("force quit jobs after a timeout", async function(){
      let result: any;
      let _op = q.add(async ({signal})=>timers.setTimeout(100, null, /*no signal support */));

      //Shouldn't throw despite the task throwing an AbortError
      await q.close(1);
      await expect(_op).to.be.rejectedWith("Queue close timeout")
    })
  });

  describe("add()", function(){
    it("can process a task", async function(){
      const result = await q.add(()=>Promise.resolve("Hello"));
      expect(result).to.equal("Hello");
    });
  });
})
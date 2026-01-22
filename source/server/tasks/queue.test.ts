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

    it.skip("cancels running jobs")
  });

  describe("add()", function(){
    it("can process a task", async function(){
      const result = await q.add(()=>Promise.resolve("Hello"));
      expect(result).to.equal("Hello");
    });
  });
})
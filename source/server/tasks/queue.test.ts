import timers from "node:timers/promises";
import { Queue } from "./queue.js";



describe("Queue", function () {
  let q: Queue;
  this.beforeEach(function () {
    q = new Queue();
  });
  describe("close()", function () {
    it("close enmpty queue", async function () {
      await q.close();
    });
    it("can't close twice", async function () {
      await q.close();
      await expect(q.close()).to.be.rejectedWith("already closed");
    });
    it("can't add jobs once closed", async function () {
      await q.close();
      //add() throws synchronously
      expect(() => q.add(() => Promise.resolve())).to.throw("Can't add new tasks");
    });

    it("cancels running jobs", async function () {
      let result: any;
      let _op = q.add(async ({ signal }) => {
        try {
          await timers.setTimeout(1000, null, { signal })
          result = "ok";
        } catch (e: any) {
          result = e.name;
          throw e;
        }
      }).catch(e => e);

      //Shouldn't throw despite the task throwing an AbortError
      await q.close(100);
      expect(result).to.equal("AbortError");
      expect(await _op).to.have.property("name", "AbortError");
    })

    it("force quit jobs after a timeout", async function () {
      let result: any;
      let _op = q.add(async ({ signal }) => timers.setTimeout(100, null, /*no signal support */));

      //Shouldn't throw despite the task throwing an AbortError
      await q.close(1);
      await expect(_op).to.be.rejectedWith("Queue close timeout")
    })
  });

  describe("add()", function () {
    it("can process a task", async function () {
      const result = await q.add(() => Promise.resolve("Hello"));
      expect(result).to.equal("Hello");
    });

    it("respects concurrency limit", async function () {
      q = new Queue(2);
      let running = 0;
      let maxRunning = 0;
      const tasks = [];
      for (let i = 0; i < 6; i++) {
        tasks.push(q.add(async () => {
          running++;
          maxRunning = Math.max(maxRunning, running);
          await timers.setTimeout(10);
          running--;
          return i;
        }));
      }
      const results = await Promise.all(tasks);
      expect(results).to.deep.equal([0, 1, 2, 3, 4, 5]);
      expect(maxRunning).to.equal(2);
    });
  });

  describe("unshift()", function () {
    it("bypasses concurrency limit", async function () {
      q = new Queue(1);
      const order: number[] = [];
      // Fill the queue with a slow task
      const t1 = q.add(async () => {
        await timers.setTimeout(20);
        order.push(1);
      });
      // unshift should start immediately even though concurrency is 1
      const t2 = q.unshift(async () => {
        order.push(2);
      });
      await t2;
      expect(order).to.include(2);
      await t1;
    });
  });

  describe("nested queues (simulating scheduler nesting)", function () {
    it("nested add() calls complete without deadlock", async function () {
      this.timeout(2000);
      const root = new Queue(2, "root");
      const result = await root.add(async () => {
        const child = new Queue(1, "child");
        try {
          return await child.add(async () => {
            const grandchild = new Queue(1, "grandchild");
            try {
              return await grandchild.add(async () => "deep result");
            } finally {
              await grandchild.close();
            }
          });
        } finally {
          await child.close();
        }
      });
      expect(result).to.equal("deep result");
      await root.close();
    });

    it("deeply nested queues with awaits between levels don't deadlock", async function () {
      this.timeout(2000);
      const root = new Queue(2, "root");
      const executed: number[] = [];

      await root.add(async () => {
        executed.push(1);
        const q1 = new Queue(1, "q1");
        try {
          await q1.add(async () => {
            executed.push(2);
            // Yield to event loop (mimics timers.setTimeout(0) in the scheduler test)
            await timers.setTimeout(0);
            const q2 = new Queue(1, "q2");
            try {
              await q2.add(async () => {
                executed.push(3);
              });
            } finally {
              await q2.close();
            }
          });
        } finally {
          await q1.close();
        }
      });

      expect(executed).to.deep.equal([1, 2, 3]);
      await root.close();
    });

    it("queue close() after all tasks complete returns immediately", async function () {
      const child = new Queue(1, "child");
      await child.add(() => Promise.resolve("done"));
      // All tasks done, close should not hang
      await child.close();
    });

    it("multiple concurrent tasks with nested queues don't deadlock", async function () {
      this.timeout(3000);
      const root = new Queue(2, "root");
      const results = await Promise.all(
        Array.from({ length: 4 }, (_, i) =>
          root.add(async () => {
            const nested = new Queue(1, `nested-${i}`);
            try {
              return await nested.add(async () => {
                await timers.setTimeout(1);
                return i;
              });
            } finally {
              await nested.close();
            }
          })
        )
      );
      expect(results).to.deep.equal([0, 1, 2, 3]);
      await root.close();
    });

    it("nested queue close() with pending tasks rejects them", async function () {
      const child = new Queue(1, "child");
      const t1 = child.add(async ({ signal }) => {
        await timers.setTimeout(500, null, { signal });
      });
      const t2 = child.add(() => Promise.resolve("pending"));

      await child.close(50);
      // t1 should abort, t2 should be rejected (never started)
      await expect(t1).to.be.rejected;
      await expect(t2).to.be.rejected;
    });
  });
})
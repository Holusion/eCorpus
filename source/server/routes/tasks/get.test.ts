import { formatTaskTree } from "./get.js"




describe("formatTaskTree()", function(){
  it("formats simple task", function(){
    expect(formatTaskTree({
      task_id: 0,
      type: "extractZip",
      status: "pending",
      ctime: new Date('2025-10-13T13:30:47.105Z'),
      children: []
    })).to.deep.equal(["├─ #0 extractZip (pending)"]);
  });
  it("formats children", function(){
    expect(formatTaskTree({
      task_id: 0,
      type: "extractZip",
      status: "pending",
      ctime: new Date('2025-10-13T13:30:47.105Z'),
      children: [
        {
          task_id: 1,
          type: "delayTask",
          status: "success",
          ctime: new Date('2025-10-13T13:30:47.105Z'),
          children: []
        },{
          task_id: 2,
          type: "delayTask",
          status: "success",
          ctime: new Date('2025-10-13T13:30:47.105Z'),
          children: [
            {
              task_id: 3,
              type: "delayTask",
              status: "error",
              ctime: new Date('2025-10-13T13:30:47.105Z'),
              children: []
            }
          ]
        }
      ]
    })).to.deep.equal([
      "├─ #0 extractZip (pending)",
      "│  ├─ #1 delayTask (success)",
      "│  ├─ #2 delayTask (success)",
      "│  │  ├─ #3 delayTask (error)",
    ]);
  });
})
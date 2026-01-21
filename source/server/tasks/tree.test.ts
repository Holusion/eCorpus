import type { TaskStatus } from "./types.js";
import { findNode, getTaskDependencies, parseNodes, StoredTasksTreeNode } from "./tree.js"
import { NotFoundError } from "../utils/errors.js";

let _id = 0;
const mknode = (props:Partial<StoredTasksTreeNode|StoredTasksTreeNode> = {})=>({
  task_id: _id++,
  type: "delayTask",
  /** This task's status */
  status: "success",
  ctime: new Date('2026-01-21T10:12:04.521Z'),
  output: null,
  children: [],
  ...props,
} satisfies StoredTasksTreeNode)



describe("task trees", function(){
  this.beforeEach(function(){
    _id = 0;
  });

  describe("parseNodes()", function(){
    ([
      "error",
      "success",
      "pending",
    ] as TaskStatus[]).forEach(status=>{
      it(`status ${status} from root task`, function(){
        const nodes = mknode({
          status: status,
          children: [
            mknode({status:"success"})
          ]
        });
        expect(parseNodes(nodes)).to.have.property("groupStatus", status);
      });
      it(`status ${status} from child task`, function(){
        const nodes = mknode({
          status: "success",
          children: [
            mknode({status}),
            mknode({status: "success"}),
          ]
        });
        expect(parseNodes(nodes)).to.have.property("groupStatus", status);
      });
    });
  });

  describe("getGroupIds", function(){
    it("resolves all task dependencies", function(){
      const tree = parseNodes(mknode({
        task_id: 0,
        children: [
          mknode({
            task_id: 1,
            after: [0, 3],
            children: [mknode({task_id: 2})]
          }),
          mknode({
            task_id: 3,
            after: [4],
            children: [mknode({task_id: 4})]
          }),
        ]
      }));
      const ids = getTaskDependencies(tree, 1);
      expect(ids).to.have.members([0, 3, 4]);
    });

    it("can't link across tree boundaries", function(){
      const tree = parseNodes(mknode({
        task_id: 0,
        children: [],
        after: [1]
      }));
      expect(()=>getTaskDependencies(tree)).to.throw(NotFoundError);
    });

    it("removes duplicates", function(){
      //Try to make a common pattern of tasks grouping
      const tree = parseNodes(mknode({
        task_id: 0,
        children: [
          mknode({
            task_id: 1,
            after: [2, 3],
            children: []
          }),
          mknode({
            task_id: 2,
            after: [4],
          }),
          mknode({
            task_id: 3,
            after: [4],
          }),
          mknode({
            task_id: 4,
            after: [],
          }),
        ]
      }));
      const ids = getTaskDependencies(tree, 1);
      expect(ids).to.have.members([2, 3, 4]);

    })
  });

  describe("findNode()", function(){
    const tree = parseNodes(mknode({
        task_id: 0,
        children: [
          mknode({
            task_id: 1,
            children: [mknode({task_id: 2})]
          }),
          mknode({task_id: 3}),
        ]
      }));
    it("finds root node", function(){
      expect(findNode(tree, 0)).to.have.property("task_id", 0);
    });
    it("finds child node", function(){
      expect(findNode(tree, 2)).to.have.property("task_id", 2);
    });
  });

})
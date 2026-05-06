---
title: Task processing
---

The task processing subsystem takes care of any long-running operations, like user uploads processing, data compression, etc.


Tasks are created by API requests. Some can be synchronous (the request will end when its underlying task(s) are done) or asynchronous (the request returns immediately with a reference to the created task which run in the background). If not explicitely stated in the API doc, all tasks created by a request are expected to finish with success before the request clears.

## Design patterns

### Identification

All tasks are referenced by their (monotonically increasing) `task_id`. Additionally, tasks are linked to a `scene_id` and/or a `user_id`, depending on their context.

All tasks also have a defined `type` that derfines how they will be processed.

### Relations

#### Parent - Child

A task can have a `parent`, with which it will share the same `scene_id` and `user_id`. Tasks with no parent are **root tasks**. In most views, only root tasks are listed.

There is no explicit ordering relation between a parent and a child, though as tasks are expected to complete as fast as possible, it is generally expected that a parent will complete just after having created its children.

#### Ordering

Relations between tasks are defined as a `source -(m:n)-> target` link table. This relationship is generally marked as an `after` property on tasks, listing all `task_id` that are required to be in `success` state for this task to run.

At execution time, a task's `after` relations' outputs are available through its `inputs` parameter. 

#### Output Chaining

A last layer of relation is available through tasks return values. If a task returns an integer, it will be interpreted as a `task_id` and the task scheduler will recursively wait on it when asked to wait for a task's completion.

It allows patterns where a root task creates an arbitrary number of processing children, then a last task that will gather the outputs of all the other children and returns its `task_id`. Thus Someone waiting for completion of the root task will properly receive the resolved end result with a single `taskScheduler.wait()` call.

When a task needs to resolve to a group of children, use the [map-reduce](#map-reduce) pattern.

### Control flow

#### Starting a task

A task will start when **ALL** these conditions are met simultaneously :
- The task has a status of `pending`
- All tasks from its `after` property have a status `success`
- A processing queue is available (the number of concurrent tasks is strictly limited)

#### map-reduce

A `map/reduce` pattern can be achieved using the `groupOutputsTask` and a simplified string substitution language.

Values from the task's `inputs` are mapped to its output using its data value and substituting `$[<task_id>]` with the corresponding task output




### Debugging tasks

Enabling `NODE_DEBUG` flags can be pretty verbose but it might help a lot :

- **tasks:logs**: Show tasks logs
- **tasks:scheduler**: Task scheduling flow. Mainly helps diagnosing early returns and unexpected `wait` behaviours
- **tasks:processor**: Task processing flow, to diagnose concurrency issues and deadlocks
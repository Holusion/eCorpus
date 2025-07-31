import { IDocument } from "../../schema/document.js";
import { ISetup, ITour, ITourStep } from "../../schema/setup.js";
import uid from "../../uid.js";
import { mapTarget, unmapTarget } from "./snapshot.js";
import { DerefNode, DerefSetup, DerefSnapshots, DerefState, DerefTour, fromMap, IdMap, toIdMap } from "./types.js";

export function appendSetup(document :Required<IDocument>, {tours: toursMap, snapshots, ...setup} :DerefSetup) :number{
  let iSetup :ISetup = {...setup};

  const tours = fromMap(toursMap ?? {});
  if(tours.length){
    iSetup.tours = tours.map(({steps, ...t})=>({
      ...t,
      steps: fromMap(steps),
    }));
  }
  
  if(snapshots){
    const targetStrings = Object.keys(snapshots.targets)
      .map(k => Object.entries(snapshots.targets[k]).map(([prop, index])=>({value:`${k}/${prop}`, index})))
      .flat()
      .sort((a, b)=>a.index - b.index)
      .map(e=>e.value);
    const targets = targetStrings.map(t=>unmapTarget(t, document.nodes));
    iSetup.snapshots = {
      ...snapshots,
      targets,
      states: fromMap(snapshots.states ?? {}).map(s=>({
        ...s, 
        values: targetStrings.map(t=>s.values[t])
      })),
    };
  }
  
  const idx = document.setups.push(iSetup) - 1;
  return idx;
}


export function mapSetup({tours, snapshots, ...iSetup} :ISetup, nodes :DerefNode[]) :DerefSetup {
  const setup = {
    ...iSetup,
    tours: (tours?.length ? toIdMap(tours.map(t=>({
      ...t,
      steps: toIdMap(t.steps)
    }))) : undefined) as IdMap<DerefTour & {id:string}>,
    snapshots: undefined as any as DerefSnapshots,
  }
  
  if(snapshots){
    const targetNames = snapshots.targets.map(t=>mapTarget(t, nodes))
    const targets = targetNames.reduce((targets, t, index)=>{
      const [root, id, ...propPath] = t.split("/");
      targets[`${root}/${id}`] ??= {};
      targets[`${root}/${id}`][propPath.join("/")] = index;
      return targets;
    }, {} as Record<string, Record<string, number>>);


    const states :DerefState[] = []
    for(let state of snapshots?.states??[]){
      if(state.values.length != targetNames.length){
        throw new Error(`Invalid snapshot states length ${state.values.length} != ${targetNames.length}`);
      }
      
      const values = {} as Record<string, any>;
      for(let idx = 0; idx < state.values.length; idx++){
        const key = targetNames[idx];
        values[key] = state.values[idx];
      }
      states.push({...state, values})
    }

    setup.snapshots = {
      ...snapshots,
      targets ,
      states: toIdMap(states),
    };

  }
  return setup;
}

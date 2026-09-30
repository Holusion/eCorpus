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
      //`apply()` skips patches for removed objects, so a tour reaching this point should
      //always carry its steps. Default anyway: a half-built tour must not throw here.
      steps: fromMap(steps ?? {}),
    }));
  }
  
  if(snapshots){
    const targetStrings = Object.keys(snapshots.targets ?? {})
      .map(k => Object.entries(snapshots.targets[k]).map(([prop, index])=>({value:`${k}/${prop}`, index})))
      .flat()
      .sort((a, b)=>a.index - b.index)
      .map(e=>e.value);
    //A target whose node is gone is dropped, along with its column in every state, rather
    //than failing the whole document. `targets` and each `values` stay index-aligned.
    const resolved = targetStrings
      .map(key => ({key, target: unmapTarget(key, document.nodes)}))
      .filter((e) :e is {key :string, target :string} => typeof e.target === "string");
    iSetup.snapshots = {
      ...snapshots,
      targets: resolved.map(e=>e.target),
      states: fromMap(snapshots.states ?? {}).map(s=>({
        ...s, 
        values: resolved.map(e=>s.values[e.key])
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
    const mapped = snapshots.targets.map(t=>mapTarget(t, nodes));
    //Keep the source index of every target we could resolve, so a target pointing at a
    //node that isn't there is dropped together with its column in each state.
    const kept = mapped.reduce((kept, t, index)=>{
      if(typeof t === "string") kept.push({index, name: t});
      return kept;
    }, [] as Array<{index :number, name :string}>);

    const targets = kept.reduce((targets, {name}, index)=>{
      const [root, id, ...propPath] = name.split("/");
      targets[`${root}/${id}`] ??= {};
      targets[`${root}/${id}`][propPath.join("/")] = index;
      return targets;
    }, {} as Record<string, Record<string, number>>);


    const states :DerefState[] = []
    for(let state of snapshots?.states??[]){
      if(state.values.length != mapped.length){
        throw new Error(`Invalid snapshot states length ${state.values.length} != ${mapped.length}`);
      }
      
      const values = {} as Record<string, any>;
      for(let {index, name} of kept){
        values[name] = state.values[index];
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

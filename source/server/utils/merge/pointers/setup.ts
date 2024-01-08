import { IDocument } from "../../schema/document.js";
import { ISetup, ITour, ITourStep } from "../../schema/setup.js";
import uid from "../../uid.js";
import { mapTarget, unmapTarget } from "./snapshot.js";
import { DerefNode, DerefSetup, DerefSnapshots, DerefTour, IdMap } from "./types.js";

export function appendSetup(document :Required<IDocument>, {tours: toursMap, snapshots, ...setup} :DerefSetup) :number{
  let iSetup :ISetup = {...setup};

  const tours = Object.values(toursMap ?? {});
  if(tours.length){
    iSetup.tours = tours.map(({steps, ...t})=>{
      const tour = t as ITour;
      const stepsValues = Object.values(steps);
      if(stepsValues.length){
        tour.steps = stepsValues;
      }
      return tour;
    });
  }
  
  if(snapshots){
    const targetStrings = Object.keys(snapshots.targets)
      .map(k=> Object.keys(snapshots.targets[k]).map(prop=>`${k}/${prop}`))
      .flat()
    const targets = targetStrings.map(t=>unmapTarget(t, document.nodes));
    iSetup.snapshots = {
      ...snapshots,
      targets,
      states: Object.values(snapshots.states ?? {}).map(s=>({
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
    tours: (tours?.length ? {} : undefined) as IdMap<DerefTour & {id:string}>,
    snapshots: undefined as any as DerefSnapshots,
  }

  for(let iTour of tours??[]){
    const tour :DerefTour = {...iTour, steps: {}};
    tour.id ??= uid();
    for(let step of iTour.steps ?? []){
      tour.steps[step.id] = step;
    }
    setup.tours[tour.id] = tour as DerefTour & {id: string};
  }
  if(snapshots){
    //Nest targets into objects to ease deep merge by node ID
    const targetNames = snapshots.targets.map(t=>mapTarget(t, nodes))
    const targets = targetNames.reduce((targets, t)=>{
      const [root, id, ...propPath] = t.split("/");
      targets[`${root}/${id}`] ??= {};
      targets[`${root}/${id}`][propPath.join("/")] = true;
      return targets;
    }, {} as Record<string, Record<string, true>>);


    setup.snapshots = {
      ...snapshots,
      targets ,
      states: {} as DerefSnapshots["states"],
    } as DerefSnapshots;


    for(let state of snapshots?.states??[]){
      if(state.values.length != targetNames.length){
        throw new Error(`Invalid snapshot states length ${state.values.length} != ${targets.length}`);
      }
      
      const values = {} as Record<string, any>;
      for(let idx = 0; idx < state.values.length; idx++){
        const key = targetNames[idx];
        values[key] = state.values[idx];
      }

      setup.snapshots.states[state.id] = {...state, values};
    }

  }
  return setup;
}

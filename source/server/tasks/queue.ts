




/**
 * Debounce a bound function
 * If the returned function is called multiple time during a run, the debounced function will only get called once at the end
 * @param fn 
 * @returns 
 */
export function takeOne(fn: ()=>Promise<unknown>){
  let currentAction :Promise<void>|null = null;
  let nextAction: Promise<void>|null = null;

  function take(){
    currentAction = fn().finally(()=>{
      currentAction = null;
    }).then(()=>{});
    return currentAction;
  }

  return function debounced() :Promise<void>{
    if(nextAction) return nextAction;
    else if(currentAction){
      return (nextAction ??= currentAction.then(()=>{
        nextAction = null;
        return take();
    }));
    }else{
      return take();
    }
  }
}

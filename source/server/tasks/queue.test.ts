import timers from 'node:timers/promises';
import { takeOne } from "./queue.js";



function resolvers(){
  let resolve, reject;
  let promise = new Promise((a, b)=>{ resolve = a; reject = b});
  return {promise, resolve, reject};
}

function makeDelay(time: number, fn:()=>unknown){
  return async ()=>{
    await timers.setTimeout(time);
    return await fn();
  }
}

describe("takeOne()", function(){
  it("calls debounced function", async function(){
    let callCount = 0;
    let fn = ()=> {callCount++; return Promise.resolve()};
    let t = takeOne(fn);
    await t();
    expect(callCount).to.equal(1);
    await t();
    expect(callCount).to.equal(2);
  });

  it("supports async functions", async function(){
     let callCount = 0;
    let fn = makeDelay(1, ()=>callCount++);
    let t = takeOne(fn);
    await t();
    await t();
    await timers.setTimeout(2);
    expect(callCount).to.equal(2);
  });

  it("collapse repeated calls", async function(){
    let callCount = 0;
    let fn = makeDelay(1, ()=>callCount++);
    let t = takeOne(fn);
    t(); //Calls once
    
    //Those calls should be collapsed
    let secondCall = [];
    for(let i =0; i < 3; i++){
      secondCall.push(t());
    }

    await Promise.all(secondCall);
    expect(callCount).to.equal(2);
  });


})
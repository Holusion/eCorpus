
import { expect } from "chai";
import * as errorConstructors from "./errors.js";
describe("errors", function(){
  let {HTTPError, ...defaultConstructors} = errorConstructors;
  (Object.entries(defaultConstructors)).filter(([name])=>{
    return /Error/.test(name);
  }).forEach(([name, Constructor])=>{
    it(`${name} has a default message`, function(){
      let e = new (Constructor as any)();
      expect(e).to.have.property("code").a("number");
      expect(e).to.have.property("message").ok;
    })
  })
})
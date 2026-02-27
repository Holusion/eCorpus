import User, { isUserAtLeast, isUserRole } from "./User.js";
import {expect} from "chai";



describe("isUserAtLeast()", function(){
  it("validates access level", function(){
    ["none", "use", "create", "admin"].forEach((level: any)=>{
      expect(isUserAtLeast({level}, level), `Expected ${level} to be valid`).to.be.true;
    });
  });

  it("returns false if given an unrecognized access level", function(){
    expect(isUserAtLeast({level: "admin"}, "foo" as any)).to.be.false;
    expect(isUserAtLeast({level: "foo" as any}, "none" as any)).to.be.false;
  });

  it("accepts \'null\"", function(){
    //Happens when we use getUser() and request is anonymous
    expect(isUserAtLeast(null, "use")).to.be.false;
    //Doesn't make much sense, but still true.
    expect(isUserAtLeast(null, "none")).to.be.true;
  });
});


describe("isUserRole()", function(){
  it("validates roles", function(){
     ["none", "use", "create", "admin"].forEach((level: any)=>{
      expect(isUserRole(level)).to.be.true;
    });
  });

  it("rejects bad values", function(){
     ["foo", null, undefined, -1, 0, 1].forEach((level: any)=>{
      expect(isUserRole(level), `${level} should not be a valid user role`).to.be.false;
    });
  })
})
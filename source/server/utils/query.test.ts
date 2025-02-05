import QueryString from "qs";
import { qsToBool, qsToInt } from "./query.js"
import { BadRequestError } from "./errors.js";


describe("queryString utilities", function(){
  describe("qsToBool()", function(){
    it("cast values to true", function(){
      [
        "",
        "1",
        "true",
        "yes",
        "aaa"
      ].forEach(v=>{
        expect(qsToBool(v), `"${v}" should cast to true`).to.be.true;
      });
    });

    it("cast values to false", function(){
      [
        "0",
        "false",
        "no"
      ].forEach(v=>{
        expect(qsToBool(v), `"${v}" should cast to false`).to.be.false;
      });
    });

    it("use an array's last value", function(){
      expect(qsToBool(["0", "1"])).to.be.true;
      expect(qsToBool(["1", "0"])).to.be.false;
    });

    it("rejects objects", function(){
      expect(()=>qsToBool({}), `Objects should be rejected`).to.throw(BadRequestError);
    });

    it("undefined is cast to undefined", function(){
      expect(qsToBool(undefined)).to.be.undefined;
    });
  });

  describe("qsToInt()", function(){

    it("cast int values", function(){
      expect(qsToInt("1")).to.equal(1);
      expect(qsToInt("-1")).to.equal(-1);
      expect(qsToInt("0")).to.equal(0);
    });

    it("can return undefined", function(){
      expect(qsToInt("")).to.be.undefined;
      expect(qsToInt(undefined)).to.be.undefined;
    });

    it("throw on invalid input", function(){
      expect(()=>qsToInt("foo")).to.throw(BadRequestError);
      expect(()=>qsToInt({foo:"1"})).to.throw(BadRequestError);
    });
  })
})
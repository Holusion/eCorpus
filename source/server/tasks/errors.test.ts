import { BadRequestError, HTTPError } from "../utils/errors.js";
import { parseTaskError, serializeTaskError } from "./errors.js"


describe("Tasks errors", function(){
  describe("serializeTaskError()", function(){
    it("serializes a normal error", function(){
      const outputString = serializeTaskError(new Error("The message"));
      const output = JSON.parse(outputString);
      //Don't inspect stack content...
      expect(output).to.have.property("stack").a("string");

      expect(output).to.have.property("message", "The message");
    });

    it("serializes a HTTPError", function(){
      const outputString = serializeTaskError(new HTTPError(401, "The message"));
      const output = JSON.parse(outputString);
      //Don't inspect stack content...
      expect(output).to.have.property("stack").a("string");
      expect(output).to.have.property("message", "[401] The message");
      expect(output).to.have.property("code", 401);
      expect(output).to.have.property("name", "HTTPError");
    });

    it("serializes HTTPError subclasses", function(){
      const outputString = serializeTaskError(new BadRequestError("The message"));
      const output = JSON.parse(outputString);
      //Don't inspect stack content...
      expect(output).to.have.property("stack").a("string");
      expect(output).to.have.property("message", "[400] The message");
      expect(output).to.have.property("code", 400);
      expect(output).to.have.property("name", "HTTPError");
    })
  });


  describe("parseTaskError()", function(){
    describe("handles bad values", function(){
      //Shouldn't happen outside of unexpected bugs
      //But we need this path to not be an additional nuisance in this case
      [
        null,
        undefined,
        {}
      ].forEach((v)=>{
        it(`parses ${v}`, function(){
          const out = parseTaskError(v);
          expect(out).to.be.instanceof(Error);
        });
      });
      it(`parses empty strings`, function(){
        const out = parseTaskError("");
        expect(out).to.be.instanceof(Error);
        expect(out.message).to.have.length.above(0);
      });
    });

    describe("parses serialized error", function(){
      it("Error", function(){
        const outputString = serializeTaskError(new Error("The message"));
        const out = parseTaskError(JSON.parse(outputString));
        expect(out).to.be.instanceOf(Error);
        expect(out).to.have.property("message", "The message");
      });
      it("HTTPError", function(){
        const _e = new HTTPError(401, "The message")
        const outputString = serializeTaskError(_e);
        const out = parseTaskError(JSON.parse(outputString));
        expect(out).to.be.instanceOf(HTTPError);
        expect(out).to.have.property("code", 401);
        expect(out).to.have.property("message", "[401] The message");
      });
      it("BadRequestError", function(){
        const _e = new BadRequestError("The message");
        const outputString = serializeTaskError(_e);
        const out = parseTaskError(JSON.parse(outputString));
        expect(out).to.be.instanceOf(HTTPError);
        expect(out).to.have.property("code", 400);
        expect(out).to.have.property("message", "[400] The message");
      });
      
    });
})
})

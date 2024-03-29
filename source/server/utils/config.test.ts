import {expect} from "chai";
import config, {parse} from "./config.js";

describe("config", function(){
  it("get a config option", function(){
    expect(config.public).to.equal(true);
  });

  it("is frozen", function(){
    expect(()=>{
      //@ts-ignore
      config.public = false
    }).to.throw();
  });

  describe("parse()", function(){
    it("reports error for misformated environment variables", function(){
      ["bar", "-1"].forEach(v=>{
        expect(()=> parse({"PORT": v as any}), `${v} should not be valid`).to.throw("PORT expect a valid positive integer");
      });
    });
    it("parse integers", function(){
      expect(parse({PORT:"3000"})).to.have.property("port", 3000);
    })
    
    it("parse booleans", function(){
      expect(parse({PUBLIC:"false"})).to.have.property("public", false);
      expect(parse({PUBLIC:"0"})).to.have.property("public", false);
      expect(parse({PUBLIC:"true"})).to.have.property("public", true);
      expect(parse({PUBLIC:"1"})).to.have.property("public", true);
    });

    it("set up defaults with functions", function(){
      let opts = parse({ROOT_DIR:"/app"})
      expect(opts).to.have.property("root_dir", "/app");
      expect(opts).to.have.property("files_dir", "/app/files");
    });
    
    it("override default functions if necessary", function(){
      let opts = parse({ROOT_DIR:"/app", FILES_DIR: "/tmp/files"})
      expect(opts).to.have.property("root_dir", "/app");
      expect(opts).to.have.property("files_dir", "/tmp/files");
    });
  });
});

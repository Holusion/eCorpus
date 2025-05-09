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
    it("parse integers", function(){
      expect(parse({PORT:"3000"})).to.have.property("port", 3000);
    })

    it("parse ports or unix socket paths", function(){
      expect(parse({PORT:"3000"})).to.have.property("port", 3000);
      expect(parse({PORT:"/var/run/socket.sock"})).to.have.property("port", "/var/run/socket.sock");
    });
    
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

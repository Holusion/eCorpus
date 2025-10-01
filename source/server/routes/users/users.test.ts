
import request from "supertest";

import User, { UserLevels } from "../../auth/User.js";
import UserManager from "../../auth/UserManager.js";
import { NotFoundError } from "../../utils/errors.js";
import Vfs from "../../vfs/index.js";
import { WriteFileParams } from "../../vfs/types.js";



describe("/users", function(){
  let vfs :Vfs, userManager :UserManager;
  this.beforeEach(async function(){
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager = locals.userManager;
  });
  this.afterEach(async function(){
    await cleanIntegrationContext(this);
  });

  describe("in open mode", function(){
    it("POST can create a user anonymously", async function(){
      await request(this.server).post("/users")
      .send({username:"foo", password:"12345678", email:"foo@example.com", isAdministrator: true})
      .expect(201);
    });
  })

  describe("normal operations", function(){
    let user :User, admin :User;
    this.beforeEach(async function(){
      user = await userManager.addUser("bob", "12345678", "create", "bob@example.com");
      admin = await userManager.addUser("alice", "12345678", "admin");
    });

    describe("as user", function(){
      this.beforeEach(async function(){
        this.agent = request.agent(this.server);
        await this.agent.post("/auth/login")
        .send({username: user.username, password: "12345678"})
        .set("Content-Type", "application/json")
        .set("Accept", "")
        .expect(200);
      })

      it("can't create a user", async function(){
        await this.agent.post("/users")
        .send({username:"foo", password:"12345678", email:"foo@example.com", level: "admin"})
        .expect(401);
      });

      it("can't remove a user", async function(){
        await this.agent.delete(`/users/${user.uid}`)
        .expect(401);
      });

      it("can patch another user", async function(){
        await this.agent.patch(`/users/${admin.uid}`)
        .send({username:"foo"})
        .expect(401);

        expect(await userManager.getUserByName(admin.username)).to.deep.equal(admin);
        expect(userManager.getUserByName("foo")).to.rejectedWith(NotFoundError);
      });

      it("can patch himself", async function(){
        await this.agent.patch(`/users/${user.uid}`)
        .send({username:"foo"})
        .expect(200);
        expect(await userManager.getUserByName("foo")).to.be.ok;
        expect(userManager.getUserByName(user.username)).to.rejectedWith(NotFoundError);
      });
      
      it("can't patch his level", async function(){
        await this.agent.patch(`/users/${user.uid}`)
        .send({level: "manage"})
        .expect(401);

        expect(await userManager.getUserByName(user.username)).to.deep.equal(user);
      });

      it("can't fetch user list", async function(){
        await this.agent.get("/users")
        .expect(401);
      });

      it("can't provide a bad patch key", async function(){
        await this.agent.patch(`/users/${user.uid}`)
        .send({foo: "bar"})
        .expect(400);

        expect(await userManager.getUserByName(user.username)).to.deep.equal(user);
      });

      it("can apply a no-op", async function(){
        let res = await this.agent.patch(`/users/${user.uid}`)
        .send(User.safe(user))
        .expect(200);
        expect(res.body).to.deep.equal(User.safe(user));
        expect(await userManager.getUserByName(user.username)).to.deep.equal(user);
      });
    });

    describe("as administrator", function(){
      this.beforeEach(async function(){
        this.agent = request.agent(this.server);
        await this.agent.post("/auth/login")
        .send({username: admin.username, password: "12345678"})
        .set("Content-Type", "application/json")
        .set("Accept", "")
        .expect(200);
      })
      it("can get a list of users", async function(){
        let res = await this.agent.get("/users")
        .set("Accept", "application/json")
        .expect(200);
        expect(res.body).to.have.property("length", 2);
        for(let user of res.body){
          expect(user).to.have.property("username").a("string");
          expect(user).to.have.property("uid").a("number").above(1);
          expect(user).not.to.have.property("password");
        }
      })
  
      it("can create a user", async function(){
        await this.agent.post("/users")
        .set("Content-Type", "application/json")
        .send({username: "Carol", password: "abcdefghij", level: "use", email: "carol@foo.com"})
        .expect(201);

        let carol = await userManager.getUserByName("Carol");
        expect(carol).to.have.property("level", "use");
        expect(carol).to.have.property("email", "carol@foo.com");
      });
  
      it("can create an admin", async function(){
        await this.agent.post("/users")
        .set("Content-Type", "application/json")
        .send({username: "Dave", password: "abcdefghij", level: "admin", email: "dave@foo.com"})
        .expect(201);
      });

      it("can accept plain text response", async function(){
        await this.agent.post("/users")
        .set("Content-Type", "application/json")
        .set("Accept", "text/plain")
        .send({username: "Dave", password: "abcdefghij", level: "manage", email: "dave@foo.com"})
        .expect(201)
        .expect(/Created user/);
      });
  
      it("redirects if created from the user interface form", async function(){
        await this.agent.post("/users")
        .set("Referrer", "http://localhost:8000/ui/admin/users")
        .set("Accept", "text/html")
        .set("Content-Type", "application/json")
        .send({username: "Carol", password: "abcdefghij", level: "use", email: "carol@foo.com"})
        .expect(303)
        .expect("Location", "http://localhost:8000/ui/admin/users");

        let carol = await userManager.getUserByName("Carol");
        expect(carol).to.have.property("level", "use");
        expect(carol).to.have.property("email", "carol@foo.com");
      });
  
      it("can't provide bad data'", async function(){
        await this.agent.post("/users")
        .set("Content-Type", "application/json")
        .send({username: "Oscar", password: "abcdefghij", level: "foo"})
        .expect(400);
      });

      it("can remove a user", async function(){
        let users = await (await userManager.getUsers()).length;
        await this.agent.delete(`/users/${user.uid}`)
        .expect(204);
        expect(await userManager.getUsers()).to.have.property("length",users - 1);
      });

      it("can't remove himself", async function(){
        let users = await (await userManager.getUsers()).length;
        await this.agent.delete(`/users/${admin.uid}`)
        .expect(400);
        expect(await userManager.getUsers()).to.have.property("length",users);
      });

      it("will cleanup files created by a removed user", async function(){
        let props :WriteFileParams= {scene:"foo", mime: "model/gltf-binary", name: "models/foo.glb", user_id: user.uid}
        let scene = await vfs.createScene("foo", user.uid);
        let doc_id = await vfs.writeDoc("{}", {scene: scene, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
        expect(await userManager.getPermissions(scene)).to.deep.equal([
          {uid: user.uid, username: user.username, access: "admin"},
        ]);
        let f = await vfs.createFile(props, {hash: "xxxxxx", size:10});
        await this.agent.delete(`/users/${user.uid}`)
        .expect(204);
        expect(await vfs.getFileProps(props)).to.have.property("author", "default");
        expect(await userManager.getPermissions(scene)).to.deep.equal([ ]);
      });

      it("can patch a user", async function(){
        await this.agent.patch(`/users/${user.uid}`)
        .send({username:"foo"})
        .expect(200);

        expect(await userManager.getUserByName("foo")).to.be.ok;
        expect(userManager.getUserByName(user.username)).to.rejectedWith(NotFoundError);

        //An admin patching a user shouldn't have its session data changed
        //So we check we are still properly logged-in
        let res = await this.agent.get("/auth/login")
        .expect(200);
        expect(res.body).to.have.property("username", admin.username);
      });

      it("can patch a user to admin level", async function(){
        let res = await this.agent.patch(`/users/${user.uid}`)
        .send({level: "admin"})
        .expect(200);

        expect(res.body).to.have.property("level", "admin");
        expect(res.body).to.have.property("username", user.username);
        expect(await userManager.getUserByName(user.username)).to.have.property("level", "admin");

      });

      it("can't downgrade himself", async function(){
        await this.agent.patch(`/users/${admin.uid}`)
        .send({level: "manage"})
        .expect(401);
      });
    });
  })
});

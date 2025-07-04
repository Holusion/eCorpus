import UserManager, { AccessTypes, fromAccessLevel, toAccessLevel } from "./UserManager.js";
import {tmpdir} from "os";
import fs from "fs/promises";
import path from "path";

import {expect} from "chai";
import { BadRequestError, NotFoundError, UnauthorizedError } from "../utils/errors.js";
import User, { SafeUser, StoredUser, UserLevels } from "./User.js";
import openDatabase, { Database } from "../vfs/helpers/db.js";
import { Uid } from "../utils/uid.js";
import { randomBytes } from "crypto";
import errors from "../vfs/helpers/errors.js";

describe("UserManager static methods", function(){
  describe("parsePassword()", function(){
    it("parse a password string", function(){
      let values = UserManager.parsePassword(`$scrypt$N=16$r=8$p=1$p22AX$M3o9ww`);
      expect(values).to.have.property("algo", "scrypt");
      expect(values).to.have.property("params").deep.equal({N:16, r: 8, p: 1});
      expect(values).to.have.property("salt", "p22AX");
      expect(values).to.have.property("hash", "M3o9ww");
    });
    it("throws an error for malformed passwords", function(){
      expect(()=>UserManager.parsePassword("xx")).to.throw("Malformed");
    });
  });

  describe("formatPassword()", function(){
    it("can be parsed", async function(){
      let str = await UserManager.formatPassword("foo")
      expect(str).to.match(/^[a-zA-Z0-9$+=_-]+$/);
      let values = UserManager.parsePassword(str as string);
      expect(values).to.have.property("salt");
    });
  });
  describe("verifyPassword()", function(){
    it("matches same password", async function(){
      expect(await UserManager.verifyPassword(
        "foo", 
        "$scrypt$N=16$r=2$p=1$salt$LujVzsDpII5VRQoJQw_Qjw",
      )).to.be.true;
    });
    it("rejects different passwords", async function(){
      expect(UserManager.verifyPassword(
        "foo", 
        "$scrypt$N=16$r=2$p=1$968q$43NSmFr",
      )).to.eventually.be.false;
    });
    it("bubbles errors from parsePassword", function(){
      expect(UserManager.verifyPassword(
        "foo", 
        "xx",
      )).to.be.rejectedWith("Malformed");
    });
  });

  describe("isValid", function(){
//    let tests :Record<keyof typeof UserManager.isValid, [string|UserLevels, boolean][]> = {
    let tests :Record<keyof Omit<User,"uid" | "level">, [string, boolean][]> = {
      username:[
        ["foo", true],
        ["x", false],
        ["foo@example.com", false]
      ],
      password:[
        ["12345678", true]
      ],
      email:[
        ["foo@example.com", true],
      ]
    };
    for(let key of Object.keys(tests) as [keyof typeof UserManager.isValid]){
      let values = (tests as any)[key] as [string, boolean][];
      for(let [value, res] of values){
        it(`${key}(${value}) => ${res}`, function(){
          expect(UserManager.isValid[key](value)).to.equal(res);
        });
      }
    }
    it("tests every keys", function(){
      expect(Object.keys(UserManager.isValid).sort()).to.deep.equal((Object.keys(tests).sort()));
    });

  });

  describe("toLevel", function(){
    it("converts null", function(){
      expect(toAccessLevel(null)).to.equal(0);
    })
    it("converts none", function(){
      expect(toAccessLevel("none")).to.equal(0);
    });
    it("converts admin", function(){
      expect(toAccessLevel("admin")).to.equal(3);
    });
  });

  describe("fromLevel", function(){
    it("0 -> none", function(){
      expect(fromAccessLevel(0)).to.equal("none");
    });

    it("3 -> admin", function(){
      expect(fromAccessLevel(3)).to.equal("admin");
    });
  })
});

describe("UserManager methods", function(){
  let userManager :UserManager;
  this.beforeAll(async function(){
    this.db = await openDatabase({uri: await getUniqueDb("userManager-methods-test-"+randomBytes(2).toString("hex")), forceMigration:true});
    userManager = new UserManager(this.db);
  });
  this.afterAll(async function(){
    await this.db.end();
  })

  describe("addUser()", function(){
    it("creates a user", async function(){
      let user = await expect(userManager.addUser("foo-creates-1", "abcdefghij")).to.be.fulfilled;
      expect(user).to.have.property("username", "foo-creates-1");
      let u = await userManager.getUserByName("foo-creates-1")
      expect(u).to.be.ok;
      expect(u).to.have.property("level", "create");
    });
    [
      "../something",
      "/foo",
      "foo;bar",
      "foo:bar"
    ].forEach(username=>{
      it(`rejects invalid username "${username}"`, async function(){
        await expect(userManager.addUser(username, "abcdefghij")).to.be.rejectedWith("Invalid username");
      });
    });

    it("rejects duplicate username", async function(){
      await expect(userManager.addUser("bob-duplicate-1", "abcdefghij")).to.be.fulfilled;
      await expect(userManager.addUser("bob-duplicate-1", "abcdefghij")).to.be.rejectedWith({code: errors.unique_violation, constraint: "users_username_key"} as any);
    })

    it("can handle RNG duplicates", async function(){
      let old = Uid.make;
      try{
        let u =  await expect(userManager.addUser("bob-uid-dup", "abcdefghij")).to.be.fulfilled;
        await expect(userManager.write(u)).to.be.rejectedWith({code: errors.unique_violation, constraint: "users_user_id_key"} as any);
      }finally{
        Uid.make = old;
      }
    });
  });

  describe("removeUser()", function(){
    it("remove a user", async function(){
      let u = await userManager.addUser("bob-remove-user-1", "abcdefghij");
      expect((await userManager.getUsers()).find(_u=>_u.uid == u.uid)).to.be.ok;
      await userManager.removeUser(u.uid);
      expect((await userManager.getUsers()).find(_u=>_u.uid == u.uid)).not.to.be.ok;
    });
    it("expects a valid uid", async function(){
      await expect(userManager.removeUser(10)).to.be.rejectedWith("404");
    });
  })

  describe("patchUser", function(){
    let u:User, _id= 1;
    this.beforeEach(async function(){
      u = await userManager.addUser("bob-patch-"+(++_id).toString(16).padStart(4, "0"), "abcdefghij");
    });
    [
      ["email", "foo@example.com"],
      ["username", "bar-patch-1"],
      ["level", "admin"],
    ].forEach(([key, value])=>{
      it(`can change a ${key}`, async function(){
        let updated = await userManager.patchUser(u.uid, {[key as string]: value});
        expect(updated).to.have.property(key as string, value);
        expect(updated).to.deep.equal({
          ...u,
          [key as string]: value,
        })
      });
    });
    it("rejects invalid values", async function(){
      await expect(userManager.patchUser(u.uid, {username:"x"})).to.be.rejectedWith(BadRequestError);
    })
    it("rejects invalid properties", async function(){
      await expect(userManager.patchUser(u.uid, {foo:"bar"} as any)).to.be.rejectedWith(BadRequestError);
    })
    it("throw 404 if user doesn't exist", async function(){
      await expect(userManager.patchUser(2, {username:"uid-doesnt-exist"})).to.be.rejectedWith(NotFoundError);
    })
    it("encodes passwords", async function(){
      let next = await userManager.patchUser(u.uid, {password: "12345678"});
      expect(next).to.have.property("password").not.equal("12345678");
      expect(UserManager.isValidPasswordHash(next.password as string),`encoded password should be a valid password hash. Got : ${next.password}`).to.be.true;
    })
  })

  describe("getUserByName()", function(){
    it("find a user", async function(){ 
      let user = await userManager.addUser("foo-find-user-1", "12345678", "create");
      await expect(userManager.getUserByName("foo-find-user-1")).to.eventually.deep.equal(user);
    });
    it("throws if user doesn't exist", async function(){
      await expect(userManager.getUserByName("foo-find-user-2")).to.be.rejectedWith(NotFoundError);
    })
    it("finds by email", async function(){
      let user = await userManager.addUser("foo-find-user-3", "12345678", "create", "foo-find-user-3@example.com");
      await expect(userManager.getUserByName("foo-find-user-3@example.com")).to.eventually.deep.equal(user);
    });
  })

  describe("getUserByNamePassword()", function(){
    it("find a user", async function(){
      let user = await userManager.addUser("foo-by-password", "12345678", "create");
      expect(user.password).to.be.ok;
      await expect(userManager.getUserByNamePassword("foo-by-password", "12345678")).to.eventually.deep.equal(user);
    });
    it("throws if user doesn't exist", async function(){
      await expect(userManager.getUserByNamePassword("foo-by-password-2", "bar")).to.be.rejectedWith(NotFoundError);
    });
    it("throws if password doesn't match", async function(){
      let user = await userManager.addUser("foo-by-password-3", "12345678", "create");
      await expect(userManager.getUserByNamePassword("foo-by-password-3", "bar")).to.be.rejectedWith(UnauthorizedError);
    });
  });

  describe("Access rights management", function(){
    let user :User, _id=0;
    this.beforeAll(async function(){
      await this.db.run(`INSERT INTO scenes (scene_id, scene_name, public_access) VALUES ($1, $2, $3)`, [Uid.make().toString(10), 'foo-grant-access-rights', 1]);
      await this.db.run(`INSERT INTO scenes (scene_id, scene_name, public_access) VALUES ($1, $2, $3)`, [Uid.make().toString(10), 'foo-grant-access-rights-private', 0]);
    })
    this.beforeEach(async function(){
      user = await userManager.addUser("foo-grant-"+(++_id).toString(16).padStart(4, "0"), "12345678", "create");
    });
    
    it("can return default permissions", async function(){
      //Return the value of scene.visible
      let access = await userManager.getAccessRights("foo-grant-access-rights", user.uid);
      expect(access).to.equal("read");
    });

    it("returns permission for anonymous access", async function(){
      //Return the value of scene.visible
      let access = await userManager.getAccessRights("foo-grant-access-rights-private", 0);
      expect(access).to.equal("none");
      access = await userManager.getAccessRights("foo-grant-access-rights-private", null as any);
      expect(access).to.equal("none");
    });

    it("returns proper access rights if uid is invalid", async function(){
      /** In _theory_ we wouldn't ever provide an invalid user id here but it doesn't hurt too much to check */
      let access = await userManager.getAccessRights("foo-grant-access-rights-private", Uid.make());
      expect(access).to.equal("none");
    });


    it("can set user permissions by username", async function(){
      
      for(let role of AccessTypes.slice(2).reverse()){
        // we use reverse so that we do not set permission to "none" when there is no permission existing.
        await userManager.grant("foo-grant-access-rights-private", user.username, role);
        let access = await userManager.getAccessRights("foo-grant-access-rights-private", user.uid);
        expect(access, `Access level ${role} was requested. Received ${access}`).to.equal(role);
      }
    });
    it("can set user permissions by uid", async function(){
      await userManager.grant("foo-grant-access-rights-private", user.username, "write");
      let access = await userManager.getAccessRights("foo-grant-access-rights-private", user.uid);
      expect(access, `Access level write was requested. Received ${access}`).to.equal("write");
    });

    it("returns actual user permissions", async function(){
      let u2 = await userManager.addUser("foo-grant-otheruser", "12345678", "create");
      await userManager.grant("foo-grant-access-rights", u2.uid, "write");
      let access = await userManager.getAccessRights("foo-grant-access-rights", user.uid);
      expect(access).to.equal("read");
      let u2access = await userManager.getAccessRights("foo-grant-access-rights", u2.uid);
      expect(u2access).to.equal("write");
    });

    it("can unset user permissions", async function(){
      await userManager.grant("foo-grant-access-rights", user.username, "write");
      await userManager.grant("foo-grant-access-rights", user.username, null);
      let access = await userManager.getAccessRights("foo-grant-access-rights", user.uid);
      expect(access).to.equal("read"); // default
    });

    it("can't set permissions to none if there was no specific permissions", async function(){
      await expect(userManager.grant("foo-grant-access-rights-private", user.username, "none")).to.be.rejectedWith("404");
    });

    it("can't provide unsupported role", async function(){
      await expect(userManager.grant("foo-grant-access-rights", user.username, "bar" as any)).to.be.rejectedWith("400");
    });

    it("can't provide bad username", async function(){
      await expect(userManager.grant("foo-grant-access-rights", "oscar", "read")).to.be.rejectedWith("404");
    });

    it("can't provide bad scene name", async function(){
      await expect(userManager.grant("foo-grant-access-rights-xxx", user.username, "read")).to.be.rejectedWith("404");
    });

    it("can modify public access", async function(){
      await expect(userManager.setPublicAccess("foo-grant-access-rights", "none")).to.be.fulfilled;
      await expect(userManager.setPublicAccess("foo-grant-access-rights", "read")).to.be.fulfilled;
    });

    it("can't set public access above \"read\"", async function(){
      await expect(userManager.setPublicAccess("foo-grant-access-rights", "write" as any)).to.be.rejectedWith("400");
      await expect(userManager.setPublicAccess("foo-grant-access-rights", "admin" as any)).to.be.rejectedWith("400");
    });

    it("can't provide bad scene name to setPublicAccess", async function(){
      await expect(userManager.setPublicAccess("foo-grant-access-rights-xxx", "read")).to.be.rejectedWith("404");
    });

    it("can modify default access", async function(){
      await userManager.setPublicAccess("foo-grant-access-rights", "none");
      await expect(userManager.setDefaultAccess("foo-grant-access-rights", "none")).to.be.fulfilled;
      await expect(userManager.setDefaultAccess("foo-grant-access-rights", "read")).to.be.fulfilled;
      await expect(userManager.setDefaultAccess("foo-grant-access-rights", "write")).to.be.fulfilled;
    });

    it("can't set default access above \"write\"", async function(){
      await expect(userManager.setDefaultAccess("foo-grant-access-rights", "admin" as any)).to.be.rejectedWith("400");
    });

    it("can't provide bad scene name to setDefaultAccess", async function(){
      await expect(userManager.setDefaultAccess("foo-grant-access-rights-xxx", "read")).to.be.rejectedWith("404");
    });
  });

  describe("getPermissions()", async function(){
    let user :User
    this.beforeAll(async function(){
      user = await userManager.addUser("get-permissions-user", "12345678", "create");
      await this.db.run(`INSERT INTO scenes (scene_id, scene_name) VALUES ($1, $2)`, [Uid.make().toString(10), 'foo-get-permissions']);
      await userManager.grant("foo-get-permissions", user.username, "write");
    });
    it("get a scene permissions from name", async function(){
      let perms = await userManager.getPermissions("foo-get-permissions");
      expect(perms).to.deep.equal([
        { uid: user.uid, username: user.username, access: 'write' }
      ]);
    });
  })

  describe("getKeys / addKey", function(){
    it("get an array of keys", async function(){
      let keys = await expect(userManager.getKeys()).to.be.fulfilled;
      expect(keys).to.have.property("length", 1);
      expect(keys[0]).to.be.a("string");
      expect(Buffer.from(keys[0], "base64")).to.have.property("length", 128/8);
    });
    it("add keys to be used", async function(){
      let [firstKey] = await userManager.getKeys();
      await expect(userManager.addKey()).to.be.fulfilled;
      let keys = await userManager.getKeys();
      expect(keys).to.have.property("length", 2);
      expect(Buffer.from(keys[0], "base64")).to.have.property("length", 128/8);
      expect(keys[0]).not.to.equal(firstKey);
      expect(keys[1]).to.equal(firstKey);
    });
  });
});

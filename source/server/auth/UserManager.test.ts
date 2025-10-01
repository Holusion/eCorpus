import UserManager, { AccessTypes, fromAccessLevel, toAccessLevel } from "./UserManager.js";
import {tmpdir} from "os";
import fs from "fs/promises";
import path from "path";

import {expect} from "chai";
import { BadRequestError, ConflictError, NotFoundError, UnauthorizedError } from "../utils/errors.js";
import User, { SafeUser, StoredUser, UserLevels } from "./User.js";
import openDatabase, { Database } from "../vfs/helpers/db.js";
import { Uid } from "../utils/uid.js";
import { randomBytes } from "crypto";
import errors from "../vfs/helpers/errors.js";
import Group from "./Group.js";

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
      ], 
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
      await expect(userManager.addUser("bob-duplicate-1", "abcdefghij")).to.be.rejectedWith(ConflictError);
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
    let user: User, admin: User, _id = 0;
    this.beforeAll(async function(){
      await this.db.run(`INSERT INTO scenes (scene_id, scene_name, public_access) VALUES ($1, $2, $3)`, [Uid.make().toString(10), 'foo-grant-access-rights', 1]);
      await this.db.run(`INSERT INTO scenes (scene_id, scene_name, public_access) VALUES ($1, $2, $3)`, [Uid.make().toString(10), 'foo-grant-access-rights-private', 0]);
      admin = await userManager.addUser("adele", "12345678", "admin");
    })
    this.beforeEach(async function(){
      user = await userManager.addUser("foo-grant-"+(++_id).toString(16).padStart(4, "0"), "12345678", "create");
    });
    
    it("can return default permissions", async function(){
      //Return the value of scene.visible
      let access = await userManager.getAccessRights("foo-grant-access-rights", user.uid);
      expect(access).to.equal("read");
    });

    it("returns read for allowed anonymous access", async function () {
      //Return the value of scene.visible
      await expect(await userManager.getAccessRights("foo-grant-access-rights", undefined)).to.equal("read");
      await expect(await userManager.getAccessRights("foo-grant-access-rights", null as any)).to.equal("read");
    });

    it("returns Not Found for forbidden anonymous access", async function () {
      //Return the value of scene.visible
      await expect(userManager.getAccessRights("foo-grant-access-rights-private", undefined)).to.be.rejectedWith(NotFoundError);
      await expect(userManager.getAccessRights("foo-grant-access-rights-private", null as any)).to.be.rejectedWith(NotFoundError);
    });

    it("returns Not Found if uid is invalid", async function () {
      /** In _theory_ we wouldn't ever provide an invalid user id here but it doesn't hurt too much to check */
      await expect(userManager.getAccessRights("foo-grant-access-rights-private", Uid.make())).to.be.rejectedWith(NotFoundError);
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

    it("admin level user scene access is admin", async function () {
      let access = await userManager.getAccessRights("foo-grant-access-rights-private", admin.uid);
      expect(access).to.equal("admin"); 
    })


    it("admin get Not Found when accessing non existing scene", async function () {
      await expect(userManager.getAccessRights("foo-grant-access-rights-private-56046475470876706", admin.uid)).to.be.rejectedWith(NotFoundError);
    })

    it("can't set permissions to none if there was no specific permissions", async function () {
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

  describe("User groups", function () {
    it("creates a group", async function () {
      let group: Group = await expect(userManager.addGroup("Foo")).to.be.fulfilled;
      expect(group).to.have.property("groupName", "Foo");
      let g = await userManager.getGroup("Foo");
      expect(g).to.be.ok;
      expect(g).to.have.property("groupName", "Foo");
      expect(g).to.have.property("groupUid", group.groupUid);
    })

    it("remove a group using uid", async function () {
      let group = await userManager.addGroup("Foo2");
      await userManager.removeGroup(group.groupUid);
      await expect(userManager.getGroup("Foo2")).to.be.rejectedWith(NotFoundError);
    });

    it("remove a group using name", async function () {
      let group = await userManager.addGroup("Foo2bis");
      await userManager.removeGroup(group.groupName);
      await expect(userManager.getGroup("Foo2")).to.be.rejectedWith(NotFoundError);
    });

    it("Can get a list of all groups", async function () {
      let group1 = await userManager.addGroup("Foo3_cngn5efs4");
      let group2 = await userManager.addGroup("Foo3_5lxnd5fj5");
      let groups = await userManager.getGroups();
      expect(groups.length).to.be.greaterThan(2);
      expect(groups).to.deep.include(group1)
      expect(groups).to.deep.include(group2)
    });

    describe("managing members", async function () {
      let group: Group, member: User, notMember: User;
      this.beforeAll(async function () {
        group = await userManager.addGroup("Foo3");
        member = await userManager.addUser("Member-0", "abcdefghij");
        notMember = await userManager.addUser("NotMember-0", "abcdefghij");
        await userManager.addMemberToGroup(member.username, group.groupUid);
      })

      it("Add a member to a group using uid", async function () {
        let user = await userManager.addUser("Member-1", "abcdefghij");
        let members = (await userManager.getGroup(group.groupName)).members;
        expect(members).to.not.include(user.username);

        await expect(userManager.addMemberToGroup(user.uid, group.groupUid)).to.be.fulfilled;
        members = (await userManager.getGroup(group.groupName)).members;
        expect(members).to.exist;
        expect(members).to.include(user.username);
      });

      it("Add a member to a group using username", async function () {
        let user = await userManager.addUser("Member-2", "abcdefghij");
        let members = (await userManager.getGroup(group.groupName)).members;
        expect(members).to.not.include(user.username);

        await expect(userManager.addMemberToGroup(user.username, group.groupUid)).to.be.fulfilled;
        members = (await userManager.getGroup(group.groupName)).members;
        expect(members).to.exist;
        expect(members).to.include(user.username);
      })

      it("Add a member to a group twice", async function () {
        let user = await userManager.addUser("Member-3", "abcdefghij");
        let members = (await userManager.getGroup(group.groupName)).members;
        expect(members).to.not.include(user.username);

        await expect(userManager.addMemberToGroup(user.uid, group.groupUid)).to.be.fulfilled;
        await expect(userManager.addMemberToGroup(user.uid, group.groupUid)).to.be.fulfilled;
        members = (await userManager.getGroup(group.groupName)).members;
        expect(members).to.exist;
        expect(members).to.include(user.username);
        expect(members!.filter((each: string) => each == user.username)).to.have.lengthOf(1);
      })


      it("Add inexisting user as member fails", async function () {
        await expect(userManager.addMemberToGroup("not_a_user", group.groupUid)).to.be.rejectedWith("404");
      })

      it("Add member to inexisting group fails", async function () {
        await expect(userManager.addMemberToGroup(member.username, "not_a_group")).to.be.rejectedWith("404");
      })

      it("Members of an empty group is empty collection", async function () {
        let group = await userManager.addGroup("Foo4");
        const members = (await userManager.getGroup(group.groupName)).members;
        expect(members).to.exist;
        expect(members).to.be.deep.equal([]);
      })

      it("Can check if a member is part of a group using uid and group name", async function () {
        let isMember = await expect(userManager.isMemberOfGroup(member.uid, group.groupName)).to.be.fulfilled;
        expect(isMember);
        isMember = await expect(userManager.isMemberOfGroup(notMember.uid, group.groupName)).to.be.fulfilled;
        expect(notMember).not;
      })

      it("Can check if a member is part of a group using username and group name", async function () {
        let isMember = await expect(userManager.isMemberOfGroup(member.username, group.groupName)).to.be.fulfilled;
        expect(isMember);
        isMember = await expect(userManager.isMemberOfGroup(notMember.username, group.groupName)).to.be.fulfilled;
        expect(notMember).not;
      })

      it("Can check if a member is part of a group using uid and group uid", async function () {
        let isMember = await expect(userManager.isMemberOfGroup(member.uid, group.groupUid)).to.be.fulfilled;
        expect(isMember);
        isMember = await expect(userManager.isMemberOfGroup(notMember.uid, group.groupUid)).to.be.fulfilled;
        expect(notMember).not;
      })

      it("Can check if a member is part of a group using username and group uid", async function () {
        let isMember = await expect(userManager.isMemberOfGroup(member.username, group.groupUid)).to.be.fulfilled;
        expect(isMember);
        isMember = await expect(userManager.isMemberOfGroup(notMember.username, group.groupUid)).to.be.fulfilled;
        expect(notMember).not;
      })

      it("Remove a member to a group using uid", async function () {
        let user = await userManager.addUser("Member-4", "abcdefghij");
        await userManager.addMemberToGroup(user.uid, group.groupUid);
        expect(await userManager.isMemberOfGroup(user.uid, group.groupUid));

        await expect(userManager.removeMemberFromGroup(user.uid, group.groupUid)).to.be.fulfilled;
        expect(await userManager.isMemberOfGroup(user.uid, group.groupUid)).not;
      });

      it("Remove a member to a group using username", async function () {
        let user = await userManager.addUser("Member-5", "abcdefghij");
        await userManager.addMemberToGroup(user.uid, group.groupUid);
        expect(await userManager.isMemberOfGroup(user.username, group.groupUid));

        await expect(userManager.removeMemberFromGroup(user.username, group.groupUid)).to.be.fulfilled;
        expect(await userManager.isMemberOfGroup(user.username, group.groupUid)).not;
      })

      it("Remove an inexisting member from a group", async function () {
        await expect(userManager.removeMemberFromGroup(notMember.username, group.groupUid)).to.be.rejectedWith("404");
      })

      it("Remove a member from a inexisting group", async function () {
        await expect(userManager.removeMemberFromGroup(member.username, "not_a_group")).to.be.rejectedWith("404");
      })
    });


    describe("grantGroup()", async function () {

      let group: Group, member: SafeUser, _id = 1;
      this.beforeAll(async function () {
        await this.db.run(`INSERT INTO scenes (scene_id, scene_name, public_access) VALUES ($1, $2, $3)`, [Uid.make().toString(10), 'foo-grant-group-access-rights', 1]);
        await this.db.run(`INSERT INTO scenes (scene_id, scene_name, public_access) VALUES ($1, $2, $3)`, [Uid.make().toString(10), 'foo-grant-group-access-rights-private', 0]);
        member = await userManager.addUser("maelle", "12345678");
      })
      this.beforeEach(async function () {
        group = await userManager.addGroup("foo-grant-" + (++_id).toString(16).padStart(4, "0"));
        userManager.addMemberToGroup(member.uid, group.groupUid);
      });

      it("can set group permissions by groupName", async function () {
        for (let role of AccessTypes.slice(2).reverse()) {
          // we use reverse so that we do not set permission to "none" when there is no permission existing.
          await userManager.grantGroup("foo-grant-group-access-rights-private", group.groupName, role);
          let access = await userManager.getAccessRights("foo-grant-group-access-rights-private", member.uid);
          expect(access, `Access level ${role} was requested. Received ${access}`).to.equal(role);
        }
      });
      it("can set group permissions by uid", async function () {
        await userManager.grantGroup("foo-grant-group-access-rights-private", group.groupUid, "write");
        let access = await userManager.getAccessRights("foo-grant-group-access-rights-private", member.uid);
        expect(access, `Access level write was requested. Received ${access}`).to.equal("write");
      });

      it("can unset group permissions", async function () {
        await userManager.grantGroup("foo-grant-group-access-rights", group.groupUid, "write");
        await userManager.grantGroup("foo-grant-group-access-rights", group.groupUid, null);
        let access = await userManager.getAccessRights("foo-grant-group-access-rights", member.uid);
        expect(access).to.equal("read"); // default*/
      });

      it("can get scenes and user when getting the group with permissions", async function () {
        await userManager.grantGroup("foo-grant-group-access-rights", group.groupUid, "write");
        let result_group = await userManager.getGroup(group.groupName);
        expect(result_group).to.have.property("scenes");
        expect(result_group.scenes?.length).to.equal(1);
        expect(result_group.scenes?.[0]).to.deep.equal({ scene: "foo-grant-group-access-rights", access: "write" });
        expect(result_group.members).to.include("maelle");
      });

      it("can't set permissions to none if there was no specific permissions", async function () {
        await expect(userManager.grant("foo-grant-group-access-rights-private", group.groupName, "none")).to.be.rejectedWith("404");
      });

      it("can't provide unsupported role", async function () {
        await expect(userManager.grant("foo-grant-group-access-rights", group.groupName, "bar" as any)).to.be.rejectedWith("400");
      });

      it("can't provide bad group name", async function () {
        await expect(userManager.grant("foo-grant-group-access-rights", "oscar", "read")).to.be.rejectedWith("404");
      });

      it("can't provide bad scene name", async function () {
        await expect(userManager.grant("foo-grant-group-access-rights-xxx", group.groupName, "read")).to.be.rejectedWith("404");
      });
    })
  })
});

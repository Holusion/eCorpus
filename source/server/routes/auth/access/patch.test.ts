import { randomBytes } from "crypto";
import request from "supertest";
import User, { UserLevels } from "../../../auth/User.js";
import UserManager from "../../../auth/UserManager.js";
import Vfs from "../../../vfs/index.js";
import Group from "../../../auth/Group.js";



/**
 * Minimal tests as most
 */

describe("PATCH /auth/access/:scene", function () {
  let vfs: Vfs, userManager: UserManager, user: User, admin: User, opponent: User, group: Group;

  let titleSlug: string, scene_id: number;
  this.beforeAll(async function () {
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager = locals.userManager;
    user = await userManager.addUser("bob", "12345678");
    admin = await userManager.addUser("alice", "12345678", "admin");
    opponent = await userManager.addUser("oscar", "12345678");
    group = await userManager.addGroup("My Group");
  });

  this.afterAll(async function () {
    await cleanIntegrationContext(this);
  });
  this.beforeEach(async function () {
    //Initialize a unique scene for each test
    titleSlug = this.currentTest?.title.replace(/[^\w]/g, "_").slice(0, 15) + "_" + randomBytes(4).toString("base64url");
    scene_id = await vfs.createScene(titleSlug, user.uid);
    await vfs.writeDoc("{}", { scene: scene_id, user_id: user.uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json" });
  });
  describe("user permissions", async function () {
    it("can change user permissions", async function () {
      await request(this.server).patch(`/auth/access/${titleSlug}`)
        .auth(user.username, "12345678")
        .set("Content-Type", "application/json")
        .send({ username: opponent.username, access: "write" })
        .expect(204);
      expect(await userManager.getPermissions(titleSlug)).to.have.deep.members([
        { "uid": user.uid, "username": "bob", "access": "admin" },
        { "uid": opponent.uid, "username": "oscar", "access": "write" }
      ]);
    });

    it("can use user ids", async function () {
      await request(this.server).patch(`/auth/access/${titleSlug}`)
        .auth(user.username, "12345678")
        .set("Content-Type", "application/json")
        .send({ uid: opponent.uid, access: "write" })
        .expect(204);
      expect(await userManager.getPermissions(titleSlug)).to.have.deep.members([
        { "uid": user.uid, "username": "bob", "access": "admin" },
        { "uid": opponent.uid, "username": "oscar", "access": "write" }
      ]);
    });

    it("can set multiple accesses at once", async function () {
      await request(this.server).patch(`/auth/access/${titleSlug}`)
        .auth(user.username, "12345678")
        .set("Content-Type", "application/json")
        .send([
          { uid: opponent.uid, access: "write" },
          { username: admin.username, access: "admin" },
        ])
        .expect(204);

      let perms = await userManager.getPermissions(titleSlug);
      expect(perms).to.have.length(3);
      expect(perms).to.deep.include.members([
        { "uid": user.uid, "username": "bob", "access": "admin" },
        { "uid": admin.uid, "username": "alice", "access": "admin" },
        { "uid": opponent.uid, "username": "oscar", "access": "write" }
      ]);
    });

    it("uses transaction isolation", async function () {
      //ie. will not apply part of the PATCH if something fails down the line

      await request(this.server).patch(`/auth/access/${titleSlug}`)
        .auth(user.username, "12345678")
        .set("Content-Type", "application/json")
        .send([
          { username: admin.username, access: "write" },
          { uid: opponent.uid + 1, access: "read" },
        ])
        .expect(404);

      expect(await userManager.getPermissions(titleSlug)).to.deep.equal([
        { "uid": user.uid, "username": "bob", "access": "admin" },
      ]);
    });

    it("rejects invalid access levels", async function () {
      await request(this.server).patch(`/auth/access/${titleSlug}`)
        .auth(user.username, "12345678")
        .set("Content-Type", "application/json")
        .send({ username: opponent.username, access: "xxx" })
        .expect(400);
      expect(await userManager.getPermissions(titleSlug)).to.deep.equal([
        { "uid": user.uid, "username": "bob", "access": "admin" },
      ]);
    });

    it("rejects invalid usernames", async function () {
      await request(this.server).patch(`/auth/access/${titleSlug}`)
        .auth(user.username, "12345678")
        .set("Content-Type", "application/json")
        .send({ username: "made-up-user", access: "read" })
        .expect(404);
    });

    it("can use access:\"none\" string to remove a user", async function () {
      await request(this.server).patch(`/auth/access/${titleSlug}`)
        .auth(admin.username, "12345678")
        .set("Content-Type", "application/json")
        .send({ username: user.username, access: "none" })
        .expect(204);

      expect(await userManager.getPermissions(titleSlug)).to.deep.equal([]);
    });

    it("can use an empty string to remove a user", async function () {
      await request(this.server).patch(`/auth/access/${titleSlug}`)
        .auth(admin.username, "12345678")
        .set("Content-Type", "application/json")
        .send({ username: user.username, access: "" })
        .expect(204);

      expect(await userManager.getPermissions(titleSlug)).to.deep.equal([]);
    });
  });

  describe("group permissions", async function name() {

    it("can change group permissions", async function () {
      await request(this.server).patch(`/auth/access/${titleSlug}`)
        .auth(user.username, "12345678")
        .set("Content-Type", "application/json")
        .send({ groupName: group.groupName, access: "write" })
        .expect(204);
      expect(await userManager.getPermissions(titleSlug)).to.have.deep.members([
        { "groupUid": group.groupUid, "groupName": group.groupName, "access": "write" },
        { "uid": user.uid, "username": "bob", "access": "admin" }
      ]);
    });

    it("can use group ids", async function () {
      await request(this.server).patch(`/auth/access/${titleSlug}`)
        .auth(user.username, "12345678")
        .set("Content-Type", "application/json")
        .send({ groupUid: group.groupUid, access: "write" })
        .expect(204);
      expect(await userManager.getPermissions(titleSlug)).to.have.deep.members([
        { "groupUid": group.groupUid, "groupName": group.groupName, "access": "write" },
        { "uid": user.uid, "username": "bob", "access": "admin" },
      ]);
    });

    it("can set multiple accesses at once", async function () {
      await request(this.server).patch(`/auth/access/${titleSlug}`)
        .auth(user.username, "12345678")
        .set("Content-Type", "application/json")
        .send([
          { uid: opponent.uid, access: "write" },
          { "groupUid": group.groupUid, "access": "write" }
        ])
        .expect(204);

      let perms = await userManager.getPermissions(titleSlug);
      expect(perms).to.have.length(3);
      expect(perms).to.deep.include.members([
        { "uid": user.uid, "username": "bob", "access": "admin" },
        { "groupUid": group.groupUid, "groupName": group.groupName, "access": "write" },
        { "uid": opponent.uid, "username": "oscar", "access": "write" }
      ]);
    });

    it("rejects invalid access levels", async function () {
      await request(this.server).patch(`/auth/access/${titleSlug}`)
        .auth(user.username, "12345678")
        .set("Content-Type", "application/json")
        .send({ "groupName": group.groupName, "access": "xxx" })
        .expect(400);
      expect(await userManager.getPermissions(titleSlug)).to.deep.equal([
        { "uid": user.uid, "username": "bob", "access": "admin" },
      ]);
    });

    it("rejects invalid groupName", async function () {
      await request(this.server).patch(`/auth/access/${titleSlug}`)
        .auth(user.username, "12345678")
        .set("Content-Type", "application/json")
        .send({ username: "made-up-group", access: "read" })
        .expect(404);
    });

    it("can use access:\"none\" string to remove a group", async function () {
      await userManager.grantGroup(titleSlug, group.groupUid, "write");
      await request(this.server).patch(`/auth/access/${titleSlug}`)
        .auth(admin.username, "12345678")
        .set("Content-Type", "application/json")
        .send({ groupName: group.groupName, access: "none" })
        .expect(204);

      expect(await userManager.getPermissions(titleSlug)).to.deep.equal([
        { "uid": user.uid, "username": "bob", "access": "admin" }
      ]);
    });

    it("can use an empty string to remove a group", async function () {
      await userManager.grantGroup(titleSlug, group.groupUid, "write");
      await request(this.server).patch(`/auth/access/${titleSlug}`)
        .auth(admin.username, "12345678")
        .set("Content-Type", "application/json")
        .send({ groupName: group.groupName, access: "" })
        .expect(204);

      expect(await userManager.getPermissions(titleSlug)).to.deep.equal([
        { "uid": user.uid, "username": "bob", "access": "admin" }
      ]);
    });
  })

  it("uses the same data format as GET", async function () {
    //It's generally accepted practice for PATCh requests
    await userManager.grantGroup(titleSlug, group.groupUid, "write");
    let getRes = await request(this.server).get(`/auth/access/${titleSlug}`)
      .auth(user.username, "12345678")
      .set("Accept", "application/json")
      .expect(200);

    expect(getRes.body).to.be.ok;
    await request(this.server).patch(`/auth/access/${titleSlug}`)
      .auth(user.username, "12345678")
      .set("Content-Type", "application/json")
      .send(getRes.body)
      .expect(204);

    let getAfter = await request(this.server).get(`/auth/access/${titleSlug}`)
      .auth(user.username, "12345678")
      .set("Accept", "application/json")
      .expect(200);
    expect(getAfter.body).to.deep.equal(getRes.body);
  });

  it("requires admin access", async function () {
    const body = [{ username: opponent.username, access: "admin" }, { groupName: group.groupName, access: "write" }];
    await userManager.grant(titleSlug, opponent.username, "write");
    await request(this.server).patch(`/auth/access/${titleSlug}`)
      .auth(opponent.username, "12345678")
      .set("Content-Type", "application/json")
      .send(body)
      .expect(401);

    let r = await request(this.server).patch(`/auth/access/${titleSlug}`)
      .auth(user.username, "12345678")
      .set("Content-Type", "application/json")
      .send(body)
      .expect(204);

    expect(await userManager.getAccessRights(titleSlug, opponent.uid)).to.equal("admin");
  });
});
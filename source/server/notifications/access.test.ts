// Tests for the notifications a user gets when someone gives them access to a scene, or adds them to a group

import { randomBytes } from "node:crypto";

import User from "../auth/User.js";
import UserManager from "../auth/UserManager.js";
import { Uid } from "../utils/uid.js";
import openDatabase, { Database } from "../vfs/helpers/db.js";
import { NotificationManager } from "./manager.js";
import { linkOf, messageOf } from "./messages.js";
import { NotificationItem } from "./types.js";


describe("Access notifications", function(){
  let db_uri: string, db: Database, userManager: UserManager, notifications: NotificationManager;
  let admin: User, user: User, scene_id: number, scene_name: string;
  let _id = 0;

  this.beforeAll(async function(){
    db_uri = await getUniqueDb("access-notifications-"+randomBytes(2).toString("hex"));
    db = await openDatabase({uri: db_uri, forceMigration: true});
    userManager = new UserManager(db);
    notifications = new NotificationManager({db, uri: db_uri});
    admin = await userManager.addUser("alice", "12345678", "admin");
  });
  this.afterAll(async function(){
    await notifications.close();
    await db.end();
    await dropDb(db_uri);
  });
  this.beforeEach(async function(){
    user = await userManager.addUser(`bob-${++_id}`, "12345678", "create");
    scene_id = Uid.make();
    scene_name = `access-notifications-${_id}`;
    await db.run(`INSERT INTO scenes (scene_id, scene_name) VALUES ($1, $2)`, [scene_id, scene_name]);
  });

  /** A user's notifications, with their data as pages read it */
  async function listOf(u: User){
    const items = await notifications.getNotifications(u.uid);
    const data = await notifications.getData(items.map(i=> i.notification_id));
    return items.map(({notification_id, mtime, ...item})=> ({...item, data: data.get(notification_id) ?? {}}));
  }

  describe("grant()", function(){
    it("notifies a user given access to a scene", async function(){
      await userManager.grant(scene_name, user.username, "write", {by: admin.uid});
      const items = await listOf(user);
      expect(items).to.have.length(1);
      expect(items[0]).to.deep.include({
        task_id: null,
        type: "addedToScene",
        status: null,
        read: false,
        data: {by: admin.username, access: "write", scene_id, scene_name},
      });
    });

    it("works with a user id and a scene id", async function(){
      await userManager.grant(scene_id, user.uid, "read", {by: admin.uid});
      const items = await listOf(user);
      expect(items.map(i=> [i.data.scene_name, i.data.access])).to.deep.equal([[scene_name, "read"]]);
    });

    it("doesn't notify without knowing who did it", async function(){
      await userManager.grant(scene_name, user.username, "write");
      await userManager.grant(scene_name, admin.username, "write", {by: null});
      expect(await listOf(user)).to.deep.equal([]);
      expect(await listOf(admin)).to.deep.equal([]);
    });

    it("doesn't notify those who give themselves access", async function(){
      await userManager.grant(scene_name, admin.username, "admin", {by: admin.uid});
      expect(await listOf(admin)).to.deep.equal([]);
    });

    it("doesn't notify a change of access level", async function(){
      await userManager.grant(scene_name, user.username, "read", {by: admin.uid});
      await userManager.grant(scene_name, user.username, "admin", {by: admin.uid});
      const items = await listOf(user);
      expect(items).to.have.length(1);
      expect(items[0].data).to.have.property("access", "read");
    });

    it("doesn't notify a user whose access is taken away", async function(){
      await userManager.grant(scene_name, user.username, "write");
      await userManager.grant(scene_name, user.username, null, {by: admin.uid});
      expect(await listOf(user)).to.deep.equal([]);
      expect(await db.all(`SELECT * FROM users_acl WHERE fk_user_id = $1`, [user.uid])).to.deep.equal([]);
    });

    it("leaves what it told once access is taken away", async function(){
      await userManager.grant(scene_name, user.username, "write", {by: admin.uid});
      const before = await listOf(user);
      await userManager.grant(scene_name, user.username, null, {by: admin.uid});
      expect(await listOf(user)).to.deep.equal(before);
    });

    it("notifies again once access was taken away", async function(){
      await userManager.grant(scene_name, user.username, "read", {by: admin.uid});
      await userManager.grant(scene_name, user.username, null, {by: admin.uid});
      expect(await listOf(user)).to.have.length(1);
      await userManager.grant(scene_name, user.username, "write", {by: admin.uid});
      expect((await listOf(user)).map(i=> i.data.access)).to.deep.equal(["write", "read"]);
    });

    it("doesn't notify when it's rolled back", async function(){
      await expect(userManager.isolate(async (um)=>{
        await um.grant(scene_name, user.username, "write", {by: admin.uid});
        throw new Error("Rollback");
      })).to.be.rejectedWith("Rollback");
      expect(await listOf(user)).to.deep.equal([]);
    });

    it("still reports a missing user or scene", async function(){
      await expect(userManager.grant(scene_name, "not-a-user", "write", {by: admin.uid})).to.be.rejectedWith("404");
      await expect(userManager.grant("not-a-scene", user.username, "write", {by: admin.uid})).to.be.rejectedWith("404");
      expect(await listOf(user)).to.deep.equal([]);
    });

    it("tells the name the scene had, renamed or gone", async function(){
      await userManager.grant(scene_name, user.username, "write", {by: admin.uid});
      const before = await listOf(user);
      await db.run(`UPDATE scenes SET scene_name = $2 WHERE scene_id = $1`, [scene_id, `${scene_name}-renamed`]);
      expect(await listOf(user)).to.deep.equal(before);
      await db.run(`DELETE FROM scenes WHERE scene_id = $1`, [scene_id]);
      expect(await listOf(user)).to.deep.equal(before);
    });
  });

  describe("addMemberToGroup()", function(){
    let group_name: string;
    this.beforeEach(async function(){
      group_name = `group-${_id}`;
      await userManager.addGroup(group_name);
    });

    it("notifies a user added to a group", async function(){
      await userManager.addMemberToGroup(user.username, group_name, {by: admin.uid});
      const items = await listOf(user);
      expect(items).to.have.length(1);
      expect(items[0]).to.deep.include({
        task_id: null,
        type: "addedToGroup",
        status: null,
        read: false,
        data: {by: admin.username, group_id: (await userManager.getGroup(group_name)).groupUid, group_name},
      });
    });

    it("doesn't notify a user who's a member already", async function(){
      await userManager.addMemberToGroup(user.uid, group_name);
      await expect(userManager.addMemberToGroup(user.uid, group_name, {by: admin.uid})).to.be.fulfilled;
      expect(await listOf(user)).to.deep.equal([]);
    });

    it("doesn't notify twice", async function(){
      await userManager.addMemberToGroup(user.uid, group_name, {by: admin.uid});
      const before = await listOf(user);
      await expect(userManager.addMemberToGroup(user.uid, group_name, {by: admin.uid})).to.be.fulfilled;
      expect(await listOf(user)).to.deep.equal(before);
    });

    it("doesn't notify a member who's removed", async function(){
      await userManager.addMemberToGroup(user.uid, group_name);
      await userManager.removeMemberFromGroup(user.uid, group_name);
      expect(await listOf(user)).to.deep.equal([]);
    });

    it("still reports a missing user or group", async function(){
      await expect(userManager.addMemberToGroup("not-a-user", group_name, {by: admin.uid})).to.be.rejectedWith("User not-a-user not found");
      await expect(userManager.addMemberToGroup(Uid.make(), group_name, {by: admin.uid})).to.be.rejectedWith(/User \d+ not found$/);
      await expect(userManager.addMemberToGroup(user.uid, "not-a-group", {by: admin.uid})).to.be.rejectedWith("Group not-a-group not found");
      await expect(userManager.addMemberToGroup(user.uid, Uid.make(), {by: admin.uid})).to.be.rejectedWith(/Group \d+ not found$/);
      expect(await listOf(user)).to.deep.equal([]);
    });

    it("can add a member twice in a transaction", async function(){
      await userManager.isolate(async (um)=>{
        await um.addMemberToGroup(user.uid, group_name, {by: admin.uid});
        await um.addMemberToGroup(user.uid, group_name, {by: admin.uid});
      });
      expect((await userManager.getGroup(group_name)).members).to.deep.equal([user.username]);
      expect(await listOf(user)).to.have.length(1);
    });

    it("doesn't notify without knowing who did it, or those who add themselves", async function(){
      await userManager.addMemberToGroup(user.uid, group_name);
      await userManager.addMemberToGroup(admin.uid, group_name, {by: admin.uid});
      expect(await listOf(user)).to.deep.equal([]);
      expect(await listOf(admin)).to.deep.equal([]);
    });

    it("outlives the group, telling the name it had", async function(){
      await userManager.addMemberToGroup(user.uid, group_name, {by: admin.uid});
      const before = await listOf(user);
      await userManager.removeGroup(group_name);
      expect(await listOf(user)).to.deep.equal(before);
    });
  });

  describe("messageOf() / linkOf()", function(){
    const item = (props: Partial<NotificationItem> = {}): NotificationItem => ({
      notification_id: 1, task_id: null, type: "addedToScene", status: null, read: false,
      mtime: new Date().toISOString(), ...props,
    });

    it("tells who gave what access to which scene, given its data", function(){
      const data = {by: "alice", access: "write", scene_id: 12, scene_name: "my scene"};
      expect(messageOf(item(), "en", data)).to.equal("alice gave you write access to my scene");
      expect(messageOf(item(), "fr", data)).to.equal("alice vous a donné accès en écriture à my scene");
      expect(messageOf(item(), "en", {...data, access: "admin"})).to.equal("alice made you an administrator of my scene");
    });

    it("tells who added them to which group, given its data", function(){
      const data = {by: "alice", group_id: 12, group_name: "My Group"};
      expect(messageOf(item({type: "addedToGroup"}), "en", data)).to.equal("alice added you to the group My Group");
      expect(messageOf(item({type: "addedToGroup"}), "fr", data)).to.equal("alice vous a fait rejoindre le groupe My Group");
    });

    it("tells its type without its data, as the bell does", function(){
      expect(messageOf(item(), "en")).to.equal("You were given access to a scene");
      expect(messageOf(item({type: "addedToGroup"}), "fr")).to.equal("Vous faites maintenant partie d'un groupe");
      expect(messageOf(item(), "en", {by: "alice", access: "nonsense"})).to.equal("You were given access to a scene");
    });

    it("falls back to the default message", function(){
      expect(messageOf(item({type: "somethingElse"}), "en")).to.equal("You have a new notification");
      expect(messageOf(item({type: "somethingElse"}), "en", {by: "alice"})).to.equal("You have a new notification");
      expect(messageOf(item({type: "task"}), "en")).to.equal("You have a new notification");
    });

    it("leads to where the server finds it's about", function(){
      expect(linkOf(item({notification_id: 12}))).to.equal("/ui/user/notifications/12");
      expect(linkOf(item({notification_id: 12, task_id: 3, type: "createSceneFromFiles", status: "success"}))).to.equal("/ui/tasks/3");
    });
  });
});

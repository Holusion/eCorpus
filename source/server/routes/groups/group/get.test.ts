import request from "supertest";
import User from "../../../auth/User.js";
import UserManager from "../../../auth/UserManager.js";
import Group from "../../../auth/Group.js";
import Vfs, { Scene } from "../../../vfs/index.js";



describe("GET /groups/:group", function () {
    let vfs: Vfs, userManager: UserManager, user: User, creator: User, manage: User, admin: User, member1: User, group1: Group, group2: Group, scene_uid: number;
    this.beforeAll(async function () {
        let locals = await createIntegrationContext(this);
        vfs = locals.vfs;
        userManager = locals.userManager;
        user = await userManager.addUser("ulysse", "12345678", "use", "ulysse@example.com");
        creator = await userManager.addUser("celia", "12345678", "create", "celia@example.com");
        manage = await userManager.addUser("maelle", "12345678", "manage", "maelle@example.com");
        admin = await userManager.addUser("alice", "12345678", "admin");
        member1 = await userManager.addUser("melanie", "12345678", "create", "melanie@example.com");
        group1 = await userManager.addGroup("My first group");
        await userManager.addMemberToGroup(member1.uid, group1.groupUid);
        scene_uid = await vfs.createScene("foo");
        await userManager.grantGroup(scene_uid, group1.groupUid, "read");
        group1 = await userManager.getGroup(group1.groupName);
    });

    this.afterAll(async function () {
        await cleanIntegrationContext(this);
    });

    it("can get any group as manage", async function () {
        let response = await expect(request(this.server).get(`/groups/My first group`)
            .auth(manage.username, "12345678")
            .set("Content-Type", "application/json")).to.be.fulfilled;
        let group: Group = response.body;
        expect(group.groupName).to.be.equal(group1.groupName);
        expect(group.groupUid).to.be.equal(group1.groupUid);
        expect(group.members).to.have.deep.members([member1.username]);
        expect(group.scenes).to.have.deep.members([{ scene: "foo", access: "read" }]);
    });

    it("can get any group as admin", async function () {
        let response = await expect(request(this.server).get(`/groups/My first group`)
            .auth(admin.username, "12345678")
            .set("Content-Type", "application/json")).to.be.fulfilled;
        let group: Group = response.body;
        expect(group.groupName).to.be.equal(group1.groupName);
        expect(group.groupUid).to.be.equal(group1.groupUid);
        expect(group.members).to.have.deep.members([member1.username]);
        expect(group.scenes).to.have.deep.members([{ scene: "foo", access: "read" }]);

    });


    it("can't get a group as use", async function () {
        await request(this.server).get(`/groups/My first group`)
            .auth(user.username, "12345678")
            .set("Content-Type", "application/json")
            .expect(401);
    });

    it("can't get a group as create", async function () {
        await request(this.server).get(`/groups/My first group`)
            .auth(creator.username, "12345678")
            .set("Content-Type", "application/json")
            .expect(401);
    });

    it("can't get a group as anonymous", async function () {
        await request(this.server).get(`/groups/My first group`)
            .set("Content-Type", "application/json")
            .expect(401);
    });
});

import request from "supertest";
import User from "../../../../auth/User.js";
import UserManager from "../../../../auth/UserManager.js";



describe("DELETE /groups/:group/:member", function () {
    let userManager: UserManager, member: User;
    this.beforeAll(async function () {
        let locals = await createIntegrationContext(this);
        userManager = locals.userManager;
    });
    this.beforeEach(async function () {
        await resetIntegrationContext(this);
        await userManager.addGroup("My Group")
        member = await userManager.addUser("melanie", "12345678", "manage", "melanie@example.com");
        await userManager.addMemberToGroup(member.uid, "My Group")
    });

    it("can delete a member of a group as manage", async function () {
        let manage = await userManager.addUser("maelle", "12345678", "manage", "maelle@example.com");
        await request(this.server).delete(`/groups/My Group/melanie`)
            .set("Authorization", await bearer(manage.username))
            .set("Content-Type", "application/json")
            .expect(204);
        const group = await userManager.getGroup("My Group");
        expect(group.members).to.not.have.members([member.username]);
    });

    it("can delete a member of a group as admin", async function () {
        let admin = await userManager.addUser("alice", "12345678", "admin");
        await request(this.server).delete(`/groups/My Group/melanie`)
            .set("Authorization", await bearer(admin.username))
            .set("Content-Type", "application/json")
            .expect(204);
        const group = await userManager.getGroup("My Group");
        expect(group.members).to.not.have.members([member.username]);
    });

    //Requesters without access to the group get existence-hiding 404s, like scenes
    it("can't delete a member of a group as creator", async function () {
        let creator = await userManager.addUser("celia", "12345678", "create", "celia@example.com");
        await request(this.server).delete(`/groups/My Group/melanie`)
            .set("Authorization", await bearer(creator.username))
            .set("Content-Type", "application/json")
            .expect(404);
        const group = await userManager.getGroup("My Group");
        expect(group.members).to.have.members([member.username]);
    });

    it("can't delete a member of a group as user", async function () {
        let user = await userManager.addUser("ulysse", "12345678", "use", "ulysse@example.com");
        await request(this.server).delete(`/groups/My Group/melanie`)
            .set("Authorization", await bearer(user.username))
            .set("Content-Type", "application/json")
            .expect(404);
        const group = await userManager.getGroup("My Group");
        expect(group.members).to.have.members([member.username]);
    });

    it("can't create a member of a group as anonmyous", async function () {
        await request(this.server).delete(`/groups/My Group/melanie`)
            .set("Content-Type", "application/json")
            .expect(404);
        const group = await userManager.getGroup("My Group");
        expect(group.members).to.have.members([member.username]);
    });

    it("a member can't remove another member without group admin access", async function () {
        //A mere member may read the group — nothing to hide, so 401 not 404 —
        //but membership changes are per-group administration
        let peer = await userManager.addUser("ulysse", "12345678", "use", "ulysse@example.com");
        await userManager.addMemberToGroup(peer.uid, "My Group");
        await request(this.server).delete(`/groups/My Group/melanie`)
            .set("Authorization", await bearer(peer.username))
            .set("Content-Type", "application/json")
            .expect(401);
        const group = await userManager.getGroup("My Group");
        expect(group.members).to.have.members([member.username, peer.username]);
    });

    it("Fail when trying to delete an inexisting member of a group", async function () {
        let admin = await userManager.addUser("alice", "12345678", "admin");
        await request(this.server).delete(`/groups/My Group/not_a_user`)
            .set("Authorization", await bearer(admin.username))
            .set("Content-Type", "application/json")
            .expect(404);
        const group = await userManager.getGroup("My Group");
        expect(group.members).to.have.members([member.username]);
    });

});

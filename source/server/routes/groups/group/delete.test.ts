import request from "supertest";
import UserManager from "../../../auth/UserManager.js";

describe("DELETE /groups/:group", function () {
    let userManager: UserManager;
    this.beforeAll(async function () {
        let locals = await createIntegrationContext(this);
        userManager = locals.userManager;
    });

    this.beforeEach(async function () {
        await resetIntegrationContext(this);
        await userManager.addGroup("My Group")
    });

    it("can delete a group as manage", async function () {
        let manage = await userManager.addUser("maelle", "12345678", "manage", "maelle@example.com");
        await request(this.server).delete(`/groups/My Group`)
            .set("Authorization", await bearer(manage.username))
            .set("Content-Type", "application/json")
            .expect(204);
        await (expect(userManager.getGroup("My Group")).to.be.rejectedWith("404"));
    });

    it("can delete a group as admin", async function () {
        let admin = await userManager.addUser("alice", "12345678", "admin");
        await request(this.server).delete(`/groups/My Group`)
            .set("Authorization", await bearer(admin.username))
            .set("Content-Type", "application/json")
            .expect(204);
        await (expect(userManager.getGroup("My Group")).to.be.rejectedWith("404"));
    });

    //Non-members get existence-hiding 404s, like scenes
    it("can't delete a group as creator", async function () {
        let creator = await userManager.addUser("celia", "12345678", "create", "celia@example.com");
        await request(this.server).delete(`/groups/My Group`)
            .set("Authorization", await bearer(creator.username))
            .set("Content-Type", "application/json")
            .expect(404);
        await expect(userManager.getGroup("My Group")).to.be.fulfilled;
    });

    it("can't delete a group as user", async function () {
        let user = await userManager.addUser("ulysse", "12345678", "use", "ulysse@example.com");
        await request(this.server).delete(`/groups/My Group`)
            .set("Authorization", await bearer(user.username))
            .set("Content-Type", "application/json")
            .expect(404);
        await expect(userManager.getGroup("My Group")).to.be.fulfilled;
    });

    it("can't create a group as anonmyous", async function () {
        await request(this.server).delete(`/groups/My Group`)
            .set("Content-Type", "application/json")
            .expect(404);
        await expect(userManager.getGroup("My Group")).to.be.fulfilled;
    });

    it("answers 401 to a mere member", async function () {
        //A member sees the group — nothing to hide — but read < admin
        let member = await userManager.addUser("melvin", "12345678", "use", "melvin@example.com");
        await userManager.addMemberToGroup(member.uid, "My Group");
        await request(this.server).delete(`/groups/My Group`)
            .set("Authorization", await bearer(member.username))
            .set("Content-Type", "application/json")
            .expect(401);
        await expect(userManager.getGroup("My Group")).to.be.fulfilled;
    });

    it("requires the groups:admin credential scope", async function () {
        //groups:write is the (future) per-group metadata rung: it must not
        //delegate whole-group administration
        let manage = await userManager.addUser("maelle", "12345678", "manage", "maelle@example.com");
        await request(this.server).delete(`/groups/My Group`)
            .set("Authorization", await bearer(manage.username, ["groups:write"]))
            .set("Content-Type", "application/json")
            .expect(403);
        await expect(userManager.getGroup("My Group")).to.be.fulfilled;
    });

    it("Fail when trying to delete an inexisting group", async function () {
        let admin = await userManager.addUser("alice", "12345678", "admin");
        await request(this.server).delete(`/groups/MyGroup`)
            .set("Authorization", await bearer(admin.username))
            .set("Content-Type", "application/json")
            .expect(404);
    });

});

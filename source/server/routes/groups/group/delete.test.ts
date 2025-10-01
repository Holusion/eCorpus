import request from "supertest";
import UserManager from "../../../auth/UserManager.js";

describe("DELETE /groups/:group", function () {
    let userManager: UserManager;
    this.beforeEach(async function () {
        let locals = await createIntegrationContext(this);
        userManager = locals.userManager;
        userManager.addGroup("My Group")

    });
    this.afterEach(async function () {
        await cleanIntegrationContext(this);
    });

    it("can delete a group as manage", async function () {
        let manage = await userManager.addUser("maelle", "12345678", "manage", "maelle@example.com");
        await request(this.server).delete(`/groups/My Group`)
            .auth(manage.username, "12345678")
            .set("Content-Type", "application/json")
            .expect(204);
        await (expect(userManager.getGroup("My Group")).to.be.rejectedWith("404"));
    });

    it("can delete a group as admin", async function () {
        let admin = await userManager.addUser("alice", "12345678", "admin");
        await request(this.server).delete(`/groups/My Group`)
            .auth(admin.username, "12345678")
            .set("Content-Type", "application/json")
            .expect(204);
        await (expect(userManager.getGroup("My Group")).to.be.rejectedWith("404"));
    });

    it("can't delete a group as creator", async function () {
        let creator = await userManager.addUser("celia", "12345678", "create", "celia@example.com");
        await request(this.server).delete(`/groups/My Group`)
            .auth(creator.username, "12345678")
            .set("Content-Type", "application/json")
            .expect(401);
        await expect(userManager.getGroup("My Group")).to.be.fulfilled;
    });

    it("can't delete a group as user", async function () {
        let user = await userManager.addUser("ulysse", "12345678", "use", "ulysse@example.com");
        await request(this.server).delete(`/groups/My Group`)
            .auth(user.username, "12345678")
            .set("Content-Type", "application/json")
            .expect(401);
        await expect(userManager.getGroup("My Group")).to.be.fulfilled;
    });

    it("can't create a group as anonmyous", async function () {
        await request(this.server).delete(`/groups/My Group`)
            .set("Content-Type", "application/json")
            .expect(401);
        await expect(userManager.getGroup("My Group")).to.be.fulfilled;
    });

    it("Fail when trying to delete an inexisting group", async function () {
        let admin = await userManager.addUser("alice", "12345678", "admin");
        await request(this.server).delete(`/groups/MyGroup`)
            .auth(admin.username, "12345678")
            .set("Content-Type", "application/json")
            .expect(404);
    });

});

import request from "supertest";
import User from "../../../../auth/User.js";
import UserManager from "../../../../auth/UserManager.js";



describe("PUT /groups/:group/:member", function () {
    let userManager: UserManager, member: User;
    this.beforeEach(async function () {
        let locals = await createIntegrationContext(this);
        userManager = locals.userManager;
        userManager.addGroup("My Group")
        member = await userManager.addUser("melanie", "12345678", "manage", "melanie@example.com");
    });
    this.afterEach(async function () {
        await cleanIntegrationContext(this);
    });

    it("can put a member of a group as manage", async function () {
        let manage = await userManager.addUser("maelle", "12345678", "manage", "maelle@example.com");
        await request(this.server).put(`/groups/My Group/` + member.username)
            .auth(manage.username, "12345678")
            .set("Content-Type", "application/json")
            .expect(200);
        const group = await userManager.getGroup("My Group");
        expect(group.members).to.have.members([member.username]);
    });

    it("can put a member of a group as admin", async function () {
        let admin = await userManager.addUser("alice", "12345678", "admin");
        await request(this.server).put(`/groups/My Group/` + member.username)
            .auth(admin.username, "12345678")
            .set("Content-Type", "application/json")
            .expect(200);
        const group = await userManager.getGroup("My Group");
        expect(group.members).to.have.members([member.username]);
    });

    it("can't put a member of a group as creator", async function () {
        let creator = await userManager.addUser("celia", "12345678", "create", "celia@example.com");
        await request(this.server).put(`/groups/My Group/` + member.username)
            .auth(creator.username, "12345678")
            .set("Content-Type", "application/json")
            .expect(401);
        const group = await userManager.getGroup("My Group");
        expect(group.members).to.not.have.members([member.username]);
    });

    it("can't put a member of a group as user", async function () {
        let user = await userManager.addUser("ulysse", "12345678", "use", "ulysse@example.com");
        await request(this.server).put(`/groups/My Group/` + member.username)
            .auth(user.username, "12345678")
            .set("Content-Type", "application/json")
            .expect(401);
        const group = await userManager.getGroup("My Group");
        expect(group.members).to.not.have.members([member.username]);
    });

    it("can't put a member of a group as anonmyous", async function () {
        await request(this.server).put(`/groups/My Group/` + member.username)
            .set("Content-Type", "application/json")
            .expect(401);
        const group = await userManager.getGroup("My Group");
        expect(group.members).to.not.have.members([member.username]);
    });

    it("Fail when trying to put an inexisting member of a group", async function () {
        let admin = await userManager.addUser("alice", "12345678", "admin");
        await request(this.server).put(`/groups/My Group/not_a_user`)
            .auth(admin.username, "12345678")
            .set("Content-Type", "application/json")
            .expect(404);
        const group = await userManager.getGroup("My Group");
        expect(group.members).to.not.have.members([member.username]);
    });

});

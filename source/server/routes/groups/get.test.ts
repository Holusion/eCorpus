import request from "supertest";
import User from "../../auth/User.js";
import UserManager from "../../auth/UserManager.js";
import Group from "../../auth/Group.js";



describe("GET /groups", function () {
    let userManager: UserManager, user: User, creator: User, manage: User, admin: User, group1: Group, group2: Group;
    this.beforeAll(async function () {
        let locals = await createIntegrationContext(this);
        userManager = locals.userManager;
        user = await userManager.addUser("ulysse", "12345678", "use", "ulysse@example.com");
        creator = await userManager.addUser("celia", "12345678", "create", "celia@example.com");
        manage = await userManager.addUser("maelle", "12345678", "manage", "maelle@example.com");
        admin = await userManager.addUser("alice", "12345678", "admin");
        group1 = await userManager.addGroup("My first group");
        group2 = await userManager.addGroup("My second group");

    });

    this.afterAll(async function () {
        await cleanIntegrationContext(this);
    });

    it("can get all groups as manage", async function () {
        let response = await expect(request(this.server).get(`/groups`)
            .auth(manage.username, "12345678")
            .set("Content-Type", "application/json")).to.be.fulfilled;
        expect(response.body).to.have.deep.members([group1, group2]);
    });

    it("can get all groups as admin", async function () {
        let response = await expect(request(this.server).get(`/groups`)
            .auth(manage.username, "12345678")
            .set("Content-Type", "application/json")).to.be.fulfilled;
        expect(response.body).to.have.deep.members([group1, group2]);
    });


    it("can't get groups as use", async function () {
        await request(this.server).get(`/groups`)
            .auth(user.username, "12345678")
            .set("Content-Type", "application/json")
            .expect(401);
    });

    it("can't get groups as create", async function () {
        await request(this.server).get(`/groups`)
            .auth(creator.username, "12345678")
            .set("Content-Type", "application/json")
            .expect(401);
    });

    it("can't get groups as anonymous", async function () {
        await request(this.server).get(`/groups`)
            .set("Content-Type", "application/json")
            .expect(401);
    });
});

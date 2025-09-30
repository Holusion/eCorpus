import request from "supertest";
import User from "../../auth/User.js";
import UserManager from "../../auth/UserManager.js";



describe("POST /groups", function () {
    let userManager: UserManager, user: User, creator: User, manage: User, admin: User;
    this.beforeEach(async function () {
        let locals = await createIntegrationContext(this);
        userManager = locals.userManager;
        user = await userManager.addUser("ulysse", "12345678", "use", "ulysse@example.com");
        creator = await userManager.addUser("celia", "12345678", "create", "celia@example.com");
        manage = await userManager.addUser("maelle", "12345678", "manage", "maelle@example.com");
        admin = await userManager.addUser("alice", "12345678", "admin");

    });
    this.afterEach(async function () {
        await cleanIntegrationContext(this);
    });

    it("can create a group as manage", async function () {
        await request(this.server).post(`/groups`)
            .auth(manage.username, "12345678")
            .set("Content-Type", "application/json")
            .send(JSON.stringify({ groupName: "MyGroup" }))
            .expect(201);
        await (expect(userManager.getGroup("MyGroup")).to.be.fulfilled);
    });

    it("can create a group as admin", async function () {
        await request(this.server).post(`/groups`)
            .auth(admin.username, "12345678")
            .set("Content-Type", "application/json")
            .send(JSON.stringify({ groupName: "MyGroup" }))
            .expect(201);
        await (expect(userManager.getGroup("MyGroup")).to.be.fulfilled);
    });

    it("can't create a group as creator", async function () {
        await request(this.server).post(`/groups`)
            .auth(creator.username, "12345678")
            .set("Content-Type", "application/json")
            .send(JSON.stringify({ groupName: "MyGroup" }))
            .expect(401);
        await expect(userManager.getGroup("MyGroup")).to.be.rejectedWith("404");
    });

    it("can't create a group as user", async function () {
        await request(this.server).post(`/groups`)
            .auth(user.username, "12345678")
            .set("Content-Type", "application/json")
            .send(JSON.stringify({ groupName: "MyGroup" }))
            .expect(401);
        await expect(userManager.getGroup("MyGroup")).to.be.rejectedWith("404");
    });

    it("can't create a group as anonmyous", async function () {
        await request(this.server).post(`/groups`)
            .set("Content-Type", "application/json")
            .send(JSON.stringify({ groupName: "MyGroup" }))
            .expect(401);
        await expect(userManager.getGroup("MyGroup")).to.be.rejectedWith("404");
    });

    it("Fail when trying to create an existing group", async function () {
        userManager.addGroup("MyGroup");
        await request(this.server).post(`/groups`)
            .auth(admin.username, "12345678")
            .set("Content-Type", "application/json")
            .send(JSON.stringify({ groupName: "MyGroup" }))
            .expect(409);
    });

    it("Can create a group with members", async function () {
        await request(this.server).post(`/groups`)
            .auth(admin.username, "12345678")
            .set("Content-Type", "application/json")
            .send(JSON.stringify({ groupName: "MyGroup", members: [user.username, creator.uid]}))
            .expect(201);
        let group = await (expect(userManager.getGroup("MyGroup")).to.be.fulfilled);
        expect(group).to.have.property("members");
        expect(group.members).to.have.members([user.username, creator.username]);
    });
});

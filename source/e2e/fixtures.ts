import path from "node:path";
import { expect, Page, test as base } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';


const fixtures = path.resolve(import.meta.dirname, "./__test_fixtures");

export type CreateSceneOptions = {
  permissions?: Record<string,null|"none"|"read"|"write">,
  autoDelete?:boolean,
}

type TestFixture = {
  adminPage:Page,
  userPage:Page,
  createScene:(opts?:CreateSceneOptions)=>Promise<string>,
  uniqueAccount: {username:string, password:string, uid:number},

}

export {expect} from "@playwright/test";

export const test = base.extend<TestFixture>({
  adminPage: async ({browser}, use)=>{
    const ctx = await browser.newContext({ storageState: 'playwright/.auth/admin.json', locale: "cimode" });
    const adminPage = await ctx.newPage();
    await use(adminPage);
    await ctx.close();
  },
  userPage: async ({browser}, use)=>{
    const ctx = await browser.newContext({ storageState: 'playwright/.auth/user.json', locale: "cimode" });
    const userPage = await ctx.newPage();
    await use(userPage);
    await ctx.close();
  },
  /**
   * Factory function to create new scenes with random names
   * Will _generally_ clean up scenes afterwards
   */
  createScene: async ({browser}, use)=>{
    const fs = await import("node:fs/promises");
    const data = await fs.readFile(path.join(fixtures, "cube.glb"))
    const ctx = await browser.newContext({ storageState: 'playwright/.auth/user.json', locale: "cimode" });
    const request = ctx.request;
    const names :string[] = [];
    await use(async ({permissions, autoDelete=true} :CreateSceneOptions={})=>{
        const name = randomUUID();
        if(autoDelete) names.push(name);
        let res = await request.post(`/scenes/${encodeURIComponent(name)}`, {
          data,
          headers: {"Content-Type": "model/gltf-binary"}
        });
        await expect(res).toBeOK();
        //Set expected permissions
        if(permissions){
          res = await request.patch(`/scenes/${encodeURIComponent(name)}`, {
            data: {
              permissions: permissions
            }
          });
        }
        return name;
    });
    await Promise.all(names.map(name=> request.delete(`/scenes/${encodeURIComponent(name)}?archive=false`)));
    await ctx.close();
  },
  uniqueAccount: async ({browser}, use)=>{
      let username = `testUserLogin${randomBytes(2).readUInt16LE().toString(36)}`;
      let password = randomBytes(16).toString("base64");
      let adminContext = await browser.newContext({storageState: "playwright/.auth/admin.json"});
      //Create a user for this specific test
      let res = await  adminContext.request.post("/users", {
        data: JSON.stringify({
          username,
          email: `${username}@example.com`,
          password,
          isAdministrator: false,
        }),
        headers:{
          "Content-Type": "application/json",
        }
      });
      let body = JSON.parse(await res.text());
      expect(body).toHaveProperty("uid");
      let uid :number =body.uid;
      await use({username, password, uid});
      await adminContext.close();
    },
});
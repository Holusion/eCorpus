import path from "node:path";
import { expect, test as base } from '@playwright/test';
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { randomBytes, randomUUID } from 'node:crypto';


const fixtures = path.resolve(import.meta.dirname, "./__test_fixtures");

export type CreateSceneOptions = {
  permissions?: Record<string,null|"none"|"read"|"write">,
  default_access?: "none"|"read",
  public_access?: "none"|"read"|"write",
  autoDelete?:boolean,
}

type AccessLevel = "use" | "create" | "admin";

type UniqueAccount = {username:string, password:string, uid:number};

type TestOptions = {
  /** Serve pages in the "cimode" language, which renders i18n keys instead of translations */
  cimode: boolean,
}

type TestFixture = {
  adminPage:Page,
  userPage:Page,
  createScene:(opts?:CreateSceneOptions)=>Promise<string>,
  uniqueAccount: (level?:AccessLevel)=>Promise<UniqueAccount>,
}

export {expect} from "@playwright/test";

/**
 * Chromium rejects "cimode" as a locale: contexts get a locale without translations ("zxx": no linguistic content)
 * so the UI also falls back to i18n keys, while requests ask the server for "cimode".
 * Page requests send the locale regardless of `extraHTTPHeaders`, so they need to be rewritten by a route.
 */
const cimodeOptions = { locale: "zxx", extraHTTPHeaders: { "Accept-Language": "cimode" } };

export async function routeCimode(context :BrowserContext){
  await context.route("**/*", route => route.continue({ headers: { ...route.request().headers(), "accept-language": "cimode" } }));
}

async function newCimodeContext(browser :Browser, storageState :string){
  const ctx = await browser.newContext({ storageState, ...cimodeOptions });
  await routeCimode(ctx);
  return ctx;
}

export const test = base.extend<TestFixture & TestOptions>({
  cimode: [false, { option: true }],
  locale: async ({locale, cimode}, use)=> use(cimode ? cimodeOptions.locale : locale),
  extraHTTPHeaders: async ({extraHTTPHeaders, cimode}, use)=> use(cimode ? { ...extraHTTPHeaders, ...cimodeOptions.extraHTTPHeaders } : extraHTTPHeaders),
  context: async ({context, cimode}, use)=>{
    if(cimode) await routeCimode(context);
    await use(context);
  },
  adminPage: async ({browser}, use)=>{
    const ctx = await newCimodeContext(browser, 'playwright/.auth/admin.json');
    const adminPage = await ctx.newPage();
    await use(adminPage);
    //page close could normally be omitted but here if we don't ignore the beforeUnload, it could hang forever.
    await adminPage.close({runBeforeUnload: false});
    await ctx.close();
  },
  userPage: async ({browser}, use)=>{
    const ctx = await newCimodeContext(browser, 'playwright/.auth/user.json');
    const userPage = await ctx.newPage();
    await use(userPage);
    //page close could normally be omitted but here if we don't ignore the beforeUnload, it could hang forever.
    await userPage.close({runBeforeUnload: false});
    await ctx.close();
  },
  /**
   * Factory function to create new scenes with random names
   * Will _generally_ clean up scenes afterwards
   */
  createScene: async ({browser}, use)=>{
    const fs = await import("node:fs/promises");
    const data = await fs.readFile(path.join(fixtures, "cube.glb"))
    const userCtx = await newCimodeContext(browser, 'playwright/.auth/user.json');
    // force-delete (?archive=false) requires instance-admin rights, so cleanup
    // runs through a separate admin context.
    const adminCtx = await newCimodeContext(browser, 'playwright/.auth/admin.json');
    const request = userCtx.request;
    const names :string[] = [];
    await use(async ({permissions, public_access, default_access, autoDelete=true} :CreateSceneOptions={})=>{
        const name = randomUUID();
        if(autoDelete) names.push(name);
        let res = await request.post(`/scenes/${encodeURIComponent(name)}`, {
          data,
          headers: {"Content-Type": "model/gltf-binary"}
        });
        await expect(res).toBeOK();
        //Set expected permissions
        if(permissions || public_access || default_access){
          res = await request.patch(`/scenes/${encodeURIComponent(name)}`, {
            data: {
              public_access,
              default_access,
              permissions: permissions
            }
          });
        }
        return name;
    });
    await Promise.all(names.map(async (name)=>{
      const res = await adminCtx.request.delete(`/scenes/${encodeURIComponent(name)}?archive=false`);
      // 404 is fine: a test may have force-deleted the scene already.
      if(res.status() !== 404) await expect(res, `cleanup of scene ${name}`).toBeOK();
    }));
    await userCtx.close();
    await adminCtx.close();
  },
  uniqueAccount: async ({browser}, use)=>{
    let adminContext = await browser.newContext({storageState: "playwright/.auth/admin.json"});

    await use(async (level :AccessLevel = "create")=>{
      let username = `testUserLogin${randomBytes(2).readUInt16LE().toString(36)}`;
      let password = randomBytes(16).toString("base64");
      //Create a user for this specific test
      let res = await adminContext.request.post("/users", {
        data: JSON.stringify({
          username,
          email: `${username}@example.com`,
          password,
          level,
        }),
        headers:{
          "Content-Type": "application/json",
        }
      });
      let body = JSON.parse(await res.text());
      expect(body).toHaveProperty("uid");
      let uid :number = body.uid;
      return {username, password, uid};
    });

    await adminContext.close();
  }
});
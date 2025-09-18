import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";

import { test, expect } from '@playwright/test';
import type { Page } from "@playwright/test";

const fixtures = path.resolve(import.meta.dirname, "../__test_fixtures");

//Authenticated as user
test.use({ storageState: 'playwright/.auth/user.json' });


let sceneFiles = await fs.readdir(path.resolve(fixtures, "scenes"));

test("schema validation error", async ({page, request})=>{
  const name = randomUUID();
    const scenePath = `/scenes/${encodeURIComponent(name)}`
    let res = await request.fetch(scenePath, {method: "MKCOL"});
    await expect(res).toBeOK();

    const sceneDataString = await fs.readFile(path.join(fixtures, "scene.svx.json"), {encoding:"utf-8"});
    let sceneData = JSON.parse(sceneDataString);
    delete sceneData.scene;

    res = await request.put(`${scenePath}/scene.svx.json`, {
      headers: {"Content-Type": "application/json"},
      data: JSON.stringify(sceneData),
    });


    await page.goto(`/ui${scenePath}/edit`);

    /** @fixme should visually indicate schema validation error */
});

for(let sceneFile of sceneFiles){
  test(`check ${sceneFile}`, {
    annotation: [
      {type: "category", description: "voyager"},
    ]
  }, async ({page, request})=>{
    const name = randomUUID();
    const scenePath = `/scenes/${encodeURIComponent(name)}`
    let res = await request.fetch(scenePath, {method: "MKCOL"});
    await expect(res).toBeOK();

    const sceneDataString = await fs.readFile(path.join(fixtures, "scenes", sceneFile), {encoding:"utf-8"});
    const sceneData = JSON.parse(sceneDataString);

    res = await request.put(`${scenePath}/scene.svx.json`, {
      headers: {"Content-Type": "application/json"},
      data: sceneDataString,
    });
    await expect(res).toBeOK();

    const models = new Set<string>(sceneData.models.map(model=>{
      return model.derivatives.map(derivative=>{
        return derivative.assets.map(asset=>asset.uri)
      })
    }).flat(Infinity));
    const models_cache = new Map<string, Buffer>();

    for(let modelURI of models){
      console.log("Upload", modelURI)
      let modelName = path.basename(modelURI);
      let data = models_cache.get(modelName) ?? await (async ()=>{
        let data = await fs.readFile(path.join(fixtures, modelName));
        models_cache.set(modelName, data);
        return data;
      })();

      res = await request.put(`${scenePath}/${modelURI}`, {
        data,
        headers: {"Content-Type": "model/gltf-binary"}
      });
      await expect(res).toBeOK();
    }

    await page.goto(`/ui${scenePath}/edit`);

    //If scene validation succeeds, a model node is created.
    await expect(page.locator(".sv-navigator-panel .sv-icon-model")).toBeVisible();

    await page.locator("sv-task-bar").getByRole('button', { name: 'Save' }).click();

    await page.reload();
    await expect(page.locator("sv-spinner")).not.toBeVisible();
    //If scene validation succeeds, a model node is created.
    await expect(page.locator(".sv-navigator-panel .sv-icon-model")).toBeVisible();


  });
}
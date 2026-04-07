import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";

import xml from 'xml-js';

import { test, expect } from '@playwright/test';

const fixtures = path.resolve(import.meta.dirname, "../__test_fixtures");

interface ReducedWebDAVProps{
  path:string,
  etag?:string,
  size?:number,
  mime?:string
}

function reducePropfind(text:string) :ReducedWebDAVProps[]{
  const root = xml.xml2js(text);
  expect(root).toHaveProperty("elements");
  const multistatus = root.elements[0];
  expect(multistatus).toHaveProperty("name", "D:multistatus");
  const responses = multistatus.elements;
  return responses.map(({elements}:any)=>{
    const href = elements.find((e: any)=>e.name === "D:href");
    expect(href, `find D:href in ${elements.map((p:any)=>p.name)}`).toBeTruthy();
    let item: ReducedWebDAVProps = {
      path: new URL(href.elements.find((e: any)=>e.type === "text").text).pathname,
    };

    const propstat = elements.find((e: any)=>e.name === "D:propstat");
    expect(propstat, `find D:propstat in ${elements.map((p: any)=>p.name)}`).toBeTruthy();
    const props = propstat.elements.find((e: any)=>e.name === "D:prop");
    for(const el of props.elements){
      const content = el.elements?.find((e: any)=>e.type ==="text")?.text;
      switch(el.name){
        case "D:getetag":
          item.etag = content;
          break;
        case "D:getcontentlength":
          item.size = parseInt(content);
          break;
        case "D:getcontenttype":
          item.mime = content;
          break;
      }
    }
    return item;
  });
}



//Authenticated as admin
test.use({ storageState: 'playwright/.auth/admin.json', locale: "cimode" });

test("uploads a scene zip", async ({page, request})=>{
  //Generate the zip file's scene
  const name = randomUUID();
  let res = await request.post(`/scenes/${name}`,{
    data: await fs.readFile(path.join(fixtures, "cube.glb")),
  });
  await expect(res).toBeOK();
  res = await request.get(`/scenes/${name}`, {
    headers: {
      "Accept": "application/zip",
    }
  });

  let body = await res.body();

  //Delete the scene
  res = await request.delete(`/scenes/${name}?archive=false`);
  await expect(res).toBeOK();

  res = await request.get(`/scenes/${name}`);
  await expect(res).not.toBeOK();

  await page.goto("/ui/upload");



  await page.locator("input[type=\"file\"]").setInputFiles({
    name: "scene.zip",
    mimeType: "application/zip",
    buffer: body,
  });

  //We expect to see a list of scenes that will be uploaded
  //In our case we expect "create" status since the scene has been deleted

  await page.getByRole("button", {name: "buttons.uploadArchive"}).click();


  const uploads = page.getByRole("region", {name: "titles.createdScenes"});
  await expect(uploads).toBeVisible();
  //Don't check for actual progress bar visibility because that could be too quick to register
  const link = uploads.getByRole("link", {name: name});
  await link.click();
  await expect(page).toHaveURL(`/ui/scenes/${name}`);
  await expect(page.getByRole("heading", {name, }).first()).toBeVisible();
});


test("uploads a multi-scene zip", async ({page, request})=>{
  //Create scenes for this test
  const names = [randomUUID(), randomUUID()];
  await Promise.all(names.map(async (name)=>{
    let res = await request.post(`/scenes/${name}`,{
      data: await fs.readFile(path.join(fixtures, "cube.glb")),
    });
    await expect(res).toBeOK();
  }));

  //We rely on this "filter by name" in other softwares anyway so it's a good check
  let res = await request.get(`/scenes?${names.map(n=>`name=${n}`).join("&")}`, {
    headers: {
      "Accept": "application/zip",
    }
  });

  //We will compare initial and restored state using the PROPFIND route's metadata
  let props :ReducedWebDAVProps[] = (await Promise.all(names.map(async name=>{
    let res = await request.fetch(`/scenes/${name}`, {
      method: "PROPFIND",
    });
    await expect(res).toBeOK();
    return reducePropfind(await res.text());
  }))).flat();


  let body = await res.body();

  //Delete the first scene
  res = await request.delete(`/scenes/${names[0]}?archive=false`);
  await expect(res).toBeOK();


  await page.goto("/ui/upload");



  await page.locator("input[type=\"file\"]").setInputFiles({
    name: "scene.zip",
    mimeType: "application/zip",
    buffer: body,
  });

  const btn = page.getByRole("button", {name: "buttons.uploadArchive"});

  await expect(btn).toBeVisible();

  //Expect first scene to be "create", because we just deleted it. Second scene should be "update"
  await expect(page.getByText(`[CREATE] ${names[0]}`)).toBeVisible();
  await expect(page.getByText(`[UPDATE] ${names[1]}`)).toBeVisible();


  await btn.click();


  const uploads = page.getByRole("region", {name: "titles.createdScenes"});
  for (let name of names){
    await expect(uploads).toBeVisible();
    //Don't check for actual progress bar visibility because that could be too quick to register
    const link = uploads.getByRole("link", {name: name});
    await expect(link).toBeVisible();
  }

  await Promise.all(names.map(async (name)=>{
    //Check the scene exists again
    let res = await request.get(`/scenes/${name}`);
    await expect(res).toBeOK();
  }));

  let updatedProps :ReducedWebDAVProps[] = (await Promise.all(names.map(async name=>{
    let res = await request.fetch(`/scenes/${name}`, {
      method: "PROPFIND",
    });
    await expect(res).toBeOK();
    return reducePropfind(await res.text());
  }))).flat();

  expect(
    updatedProps.sort((a,b)=>a.path < b.path?-1:1)
  ).toEqual(
    props.sort((a,b)=>a.path < b.path?-1:1)
  );
});
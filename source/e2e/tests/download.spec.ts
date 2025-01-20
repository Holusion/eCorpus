import path from "node:path";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import {promisify} from "node:util";

import {fromBuffer as fromBufferCb} from "yauzl";
const fromBuffer = promisify(fromBufferCb);


import { test, expect } from '@playwright/test';
import { Writable } from "node:stream";
import { on, once } from "node:events";

const fixtures = path.resolve(import.meta.dirname, "../__test_fixtures");

//Authenticated as normal user
test.use({ storageState: 'playwright/.auth/user.json' });

test("downloads a scene archive", async ({page, request})=>{
  const name = randomUUID();
  await request.post(`/scenes/${encodeURIComponent(name)}`,{
    data: await fs.readFile(path.join(fixtures, "cube.glb")),
  });

  await page.goto(`/ui/scenes/${encodeURIComponent(name)}`);
  //Check if it _looks like_ the actual scene page
  await expect(page.getByRole("heading", {name })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole("link", {name: "Download this scene"}).click();
  const download = await downloadPromise;
  let rs =  await download.createReadStream();
  let b = Buffer.allocUnsafe(4096);
  let size = 0;
  let ws = new Writable({
    write(chunk:Buffer, encoding, callback) {
      if(b.length < size + chunk.length) b = Buffer.concat([b, Buffer.allocUnsafe(Math.max(1024, chunk.length))]);
      size += chunk.copy(b, size);
      callback();
    },
  });
  rs.pipe(ws, {end: true});
  await once(rs, "end");
  b = b.subarray(0, size);
  const zip = await fromBuffer(b);
  let entries :any[] = [];
  zip.on("entry", (entry)=>{
    entries.push(entry);
  })
  await once(zip, "end");
  expect(entries).toHaveLength(2);
  expect(entries.map(e=>e.fileName).sort()).toEqual([
    `scenes/${name}/models/${name}.glb`,
    `scenes/${name}/scene.svx.json`,
  ]);
});


test.skip("download a bunch of scene archives", async ({page})=>{
  
});
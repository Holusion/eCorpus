import { test, expect } from '../fixtures.js';
import { randomBytes } from "node:crypto";

// The admin OAuth2 client-registration UI (/ui/admin/oauth).
// Runs as an administrator (the chromium project's default storageState), in
// "cimode" so labels surface as their i18n keys.
test.use({ storageState: 'playwright/.auth/admin.json', locale: "cimode" });

const uniqueName = (p: string) => `e2e-${p}-${randomBytes(4).toString("hex")}`;

test("registers a confidential client and reveals its secret exactly once", async ({page})=>{
  const name = uniqueName("client");
  const redirectUri = "https://thirdparty.example.test/callback";

  await page.goto("/ui/admin/oauth");
  await page.getByRole("button", {name: "labels.createClient"}).click();

  const dialog = page.locator("#create-client-modal");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("labels.clientName").fill(name);
  await dialog.getByLabel("labels.redirectUris").fill(redirectUri);
  // The "confidential" checkbox is checked by default → a secret is issued.
  await dialog.getByRole("button", {name: "buttons.create"}).click();

  // One-time secret reveal: id + a non-placeholder secret.
  const secretModal = page.locator("#client-secret-modal");
  await expect(secretModal).toBeVisible();
  await expect(page.locator("#reveal-client-id")).not.toBeEmpty();
  const secret = (await page.locator("#reveal-client-secret").textContent())?.trim();
  expect(secret, "a confidential client must reveal a secret").toBeTruthy();
  expect(secret).not.toEqual("—");

  await page.locator("#close-secret-modal").click();

  // The new client now appears in the list, marked confidential.
  const row = page.getByRole("row", {name: new RegExp(name)});
  await expect(row).toBeVisible();
  await expect(row).toContainText(redirectUri);
  await expect(row).toContainText("labels.confidentialClient");
});

test("registers a public client with no secret", async ({page})=>{
  const name = uniqueName("public");

  await page.goto("/ui/admin/oauth");
  await page.getByRole("button", {name: "labels.createClient"}).click();
  const dialog = page.locator("#create-client-modal");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("labels.clientName").fill(name);
  await dialog.getByLabel("labels.redirectUris").fill("https://spa.example.test/cb");
  await dialog.getByLabel("labels.confidential").uncheck();
  await dialog.getByRole("button", {name: "buttons.create"}).click();

  // Public clients (PKCE only) have nothing to reveal: the placeholder is shown.
  await expect(page.locator("#client-secret-modal")).toBeVisible();
  await expect(page.locator("#reveal-client-secret")).toHaveText("—");
  await page.locator("#close-secret-modal").click();

  const row = page.getByRole("row", {name: new RegExp(name)});
  await expect(row).toBeVisible();
  await expect(row).toContainText("labels.publicClient");
});

test("surfaces a server validation error without revealing a secret", async ({page})=>{
  const name = uniqueName("bad");

  await page.goto("/ui/admin/oauth");
  await page.getByRole("button", {name: "labels.createClient"}).click();
  const dialog = page.locator("#create-client-modal");
  await dialog.getByLabel("labels.clientName").fill(name);
  await dialog.getByLabel("labels.redirectUris").fill("not-a-valid-uri");
  await dialog.getByRole("button", {name: "buttons.create"}).click();

  // The 400 is surfaced inline; the create dialog stays open and no secret modal pops.
  await expect(page.locator("#clientcreate-error")).not.toBeEmpty();
  await expect(page.locator("#client-secret-modal")).not.toBeVisible();
});

test("deletes a client from the list", async ({page, request})=>{
  // Seed through the API (the create dialog is covered above) then delete via the UI.
  const name = uniqueName("del");
  const res = await request.post("/auth/oauth/clients", {
    data: {name, redirect_uris: ["https://x.example.test/cb"]},
  });
  await expect(res).toBeOK();

  await page.goto("/ui/admin/oauth");
  const row = page.getByRole("row", {name: new RegExp(name)});
  await expect(row).toBeVisible();
  await row.getByRole("button", {name: "labels.delete"}).click();

  // submit-fragment issues the DELETE then reloads the page.
  await expect(page.getByRole("row", {name: new RegExp(name)})).toHaveCount(0);
});

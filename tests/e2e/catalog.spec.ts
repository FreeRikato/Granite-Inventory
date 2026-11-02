import { expect, test, ensureTestUsers, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";
import { sql } from "../seam/harness";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test.beforeAll(async () => {
  await ensureTestUsers();
});

test.beforeEach(async () => {
  await resetDomainData();
  await seedYard();
});

test("catalog is hidden while off, then a logged-out visitor sees stock without prices", async ({
  page,
  signIn,
  browser,
}) => {
  await signIn("admin");
  await page.goto("/public-link");
  await expect(page.getByTestId("catalog-status")).toHaveText(/Off/);

  const visitor = await browser.newContext();
  const anon = await visitor.newPage();
  const off = await anon.goto("/catalog");
  expect(off?.status()).toBe(404);

  await page.getByLabel("WhatsApp number for inquiries").fill("+91 98765 43210");
  await page.getByRole("button", { name: "Save number" }).click();
  await expect(page.getByText("WhatsApp number saved")).toBeVisible();
  await page.getByRole("switch", { name: "Catalog is live" }).click();
  await expect(page.getByTestId("catalog-status")).toHaveText(/Live/);

  await anon.goto("/catalog");
  await expect(anon.getByRole("heading", { name: /Kirthik Granite/ })).toBeVisible();
  const tiles = anon.getByTestId("catalog-tile");
  await expect(tiles).toHaveCount(3);
  const bp = tiles.filter({ hasText: "Black Pearl" });
  await expect(bp).toContainText("4×2 ft, 16mm");
  await expect(bp).toContainText("14 slabs in stock");
  await expect(tiles.filter({ hasText: "Doom Stone" })).toContainText("9 units in stock");
  const body = await anon.locator("body").innerText();
  expect(body).not.toMatch(/₹|Madurai|BP-OLD|Bought/);
  await expect(anon.getByRole("link", { name: /Call to Inquire/ }).first()).toHaveAttribute(
    "href",
    /wa\.me\/919876543210/,
  );

  await anon.getByRole("tab", { name: "Doom Stone" }).click();
  await expect(tiles).toHaveCount(1);
  await visitor.close();
});

test("an operator cannot switch the catalog", async ({ page, signIn }) => {
  await sql(`update public.settings set catalog_public = true`);
  await signIn("operator");
  await page.goto("/public-link");
  await expect(page.getByRole("switch", { name: "Catalog is live" })).toBeDisabled();
});

test("an Admin sets a Product image in Settings and a visitor sees it on the catalog", async ({
  page,
  signIn,
  browser,
}) => {
  await sql(`update public.settings set catalog_public = true`);
  await signIn("admin");
  await page.goto("/settings");

  const card = page.getByTestId("catalog-image-tile").filter({ hasText: "Black Pearl" }).locator("visible=true");
  await expect(card).toContainText("Colour swatch");
  await expect(async () => {
    await page
      .getByLabel("Image file for Black Pearl")
      .setInputFiles({ name: "stone.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByText("Image saved")).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 20_000 });
  await expect(card).toContainText("Image set");
  await expect(card.locator("img")).toBeVisible();

  const visitor = await browser.newContext();
  const anon = await visitor.newPage();
  await anon.goto("/catalog");
  const tiles = anon.getByTestId("catalog-tile");
  await expect(tiles).toHaveCount(3);
  const photo = tiles.filter({ hasText: "Black Pearl" }).locator("img");
  await expect(photo).toHaveCount(1);
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(tiles.filter({ hasText: "Doom Stone" }).locator("img")).toHaveCount(0);
  await expect(tiles.filter({ hasText: "Jet Black" }).locator("img")).toHaveCount(0);

  await page.goto("/public-link");
  await expect(page.getByTestId("catalog-tile").filter({ hasText: "Black Pearl" }).locator("img")).toHaveCount(1);

  await page.goto("/settings");
  await expect(async () => {
    await page.getByRole("button", { name: "Remove image for Black Pearl" }).click();
    await expect(page.getByText("Image removed")).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 20_000 });
  await expect(card).toContainText("Colour swatch");
  await anon.reload();
  await expect(tiles.filter({ hasText: "Black Pearl" }).locator("img")).toHaveCount(0);
  await visitor.close();
});

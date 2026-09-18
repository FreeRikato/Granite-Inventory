import { expect, test, ensureTestUsers } from "./fixtures";

test.beforeAll(async () => {
  await ensureTestUsers();
});

async function primaryColor(page: import("@playwright/test").Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--primary").trim());
}

test("an operator picks a tint in Settings, the app repaints, and the choice survives a reload", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/settings");
  const before = await primaryColor(page);

  await page.getByRole("combobox", { name: "Tint" }).click();
  await page.getByRole("option", { name: "Blue" }).click();

  await expect(page.locator("html")).toHaveAttribute("data-tint", "blue");
  expect(await primaryColor(page)).not.toBe(before);

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-tint", "blue");
  await expect(page.getByRole("combobox", { name: "Tint" })).toHaveText("Blue");

  /* Orange is the default and leaves the attribute off, so a fresh device paints the same as before this setting existed. */
  await page.getByRole("combobox", { name: "Tint" }).click();
  await page.getByRole("option", { name: "Orange" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-tint");
  expect(await primaryColor(page)).toBe(before);
});

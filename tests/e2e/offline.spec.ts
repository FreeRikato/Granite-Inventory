import { expect, test, ensureTestUsers } from "./fixtures";

test.beforeAll(async () => {
  await ensureTestUsers();
});

test("an offline notice shows while the browser is offline and goes when it is back", async ({
  page,
  context,
  signIn,
}) => {
  await signIn("admin");
  await page.goto("/yard");
  const notice = page.getByText("You are offline");
  await expect(notice).toHaveCount(0);

  await context.setOffline(true);
  await expect(notice).toBeVisible();

  await context.setOffline(false);
  await expect(notice).toHaveCount(0);
});

test("the offline status region is in the page before the browser goes offline", async ({ page, context, signIn }) => {
  await signIn("admin");
  await page.goto("/yard");
  const region = page.getByTestId("offline-status");
  await expect(region).toBeAttached();
  await expect(region).toBeEmpty();
  const handle = await region.elementHandle();

  await context.setOffline(true);
  await expect(region).toContainText("You are offline");
  expect(await handle?.evaluate((node) => node.isConnected)).toBe(true);
});

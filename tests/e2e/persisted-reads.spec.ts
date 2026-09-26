import { expect, test, ensureTestUsers, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";

test.beforeAll(async () => {
  await ensureTestUsers();
});

test.beforeEach(async () => {
  await resetDomainData();
  await seedYard();
});

test("yard paints last known rows from disk before Supabase answers, then refreshes", async ({ page, signIn }, testInfo) => {
  testInfo.skip(testInfo.project.name !== "desktop", "Persistence is covered on desktop only");
  await signIn("admin");
  await page.goto("/yard");
  await expect(page.getByTestId("yard-batch")).toHaveCount(2);
  await expect(page.getByText(/updated just now/i)).toBeVisible();
  await page.waitForTimeout(1_500);

  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(/\/rest\/v1\//, async (route) => { await held; await route.continue(); });

  await page.reload();
  await expect(page.getByTestId("yard-batch")).toHaveCount(2);
  await expect(page.getByText(/refreshing/i)).toBeVisible();

  release();
  await expect(page.getByText(/updated just now/i)).toBeVisible();
});

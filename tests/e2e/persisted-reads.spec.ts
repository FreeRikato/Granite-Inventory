import { expect, test, ensureTestUsers, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";

test.beforeAll(async () => {
  await ensureTestUsers();
});

test.beforeEach(async () => {
  await resetDomainData();
  await seedYard();
});

/* The browser cache is persisted to IndexedDB, so a reload (or the next morning's open) paints
   the last known rows before Supabase answers, then always refreshes underneath and says so,
   however recent the rows on disk are. */
test("yard paints last known rows from disk before Supabase answers, then refreshes", async ({ page, signIn }, testInfo) => {
  testInfo.skip(testInfo.project.name !== "desktop", "Persistence is covered on desktop only");
  await signIn("admin");
  await page.goto("/yard");
  await expect(page.getByTestId("yard-batch")).toHaveCount(2);
  await expect(page.getByText(/updated just now/i)).toBeVisible();
  /* The persister writes to IndexedDB at most once a second; give it that second. */
  await page.waitForTimeout(1_500);

  /* Hold every Supabase read for a while; the rows must arrive from disk regardless. */
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(/\/rest\/v1\//, async (route) => { await held; await route.continue(); });

  await page.reload();
  await expect(page.getByTestId("yard-batch")).toHaveCount(2);
  await expect(page.getByText(/refreshing/i)).toBeVisible();

  release();
  await expect(page.getByText(/updated just now/i)).toBeVisible();
});

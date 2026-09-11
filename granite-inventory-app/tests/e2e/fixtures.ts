import { expect as baseExpect, test as base, type Locator, type Page } from "@playwright/test";
import { ensureTestUsers, resetDomainData, TEST_USERS } from "../seam/harness";

export type Who = keyof typeof TEST_USERS;

export async function signIn(page: Page, who: Who): Promise<void> {
  const response = await page.request.post("/auth/test-login", {
    data: { email: TEST_USERS[who].email, password: "test-password-123" },
  });
  if (!response.ok()) throw new Error(`test login failed: ${await response.text()}`);
}

export const test = base.extend<{ signIn: (who: Who) => Promise<void> }>({
  signIn: async ({ page }, provide) => {
    await provide((who) => signIn(page, who));
  },
});

export { expect } from "@playwright/test";
export { ensureTestUsers, resetDomainData };

/* Clicks a trigger until its dialog shows. Guards against a click landing before hydration
   on a cold dev server, which drops the handler silently. */
export async function openDialog(page: Page, trigger: Locator): Promise<void> {
  await baseExpect(async () => {
    await trigger.click();
    await baseExpect(page.getByRole("dialog")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

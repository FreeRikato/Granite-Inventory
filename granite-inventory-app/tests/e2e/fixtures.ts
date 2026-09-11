import { test as base, type Page } from "@playwright/test";
import { ensureTestUsers, resetDomainData, TEST_USERS } from "../seam/harness";

export type Who = keyof typeof TEST_USERS;

export async function signIn(page: Page, who: Who): Promise<void> {
  const response = await page.request.post("/auth/test-login", {
    data: { email: TEST_USERS[who].email, password: "test-password-123" },
  });
  if (!response.ok()) throw new Error(`test login failed: ${await response.text()}`);
}

export const test = base.extend<{ signIn: (who: Who) => Promise<void> }>({
  signIn: async ({ page }, use) => {
    await use((who) => signIn(page, who));
  },
});

export { expect } from "@playwright/test";
export { ensureTestUsers, resetDomainData };

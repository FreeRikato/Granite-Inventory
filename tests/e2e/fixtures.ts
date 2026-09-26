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

const PALETTE_INPUT = "Type a page, stone or customer...";

export async function confirmDelete(page: Page, trigger: Locator, label = "Delete"): Promise<void> {
  const dialog = page.getByRole("alertdialog");
  await baseExpect(async () => {
    await trigger.click();
    await baseExpect(dialog).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await dialog.getByRole("button", { name: label, exact: true }).click();
}

export async function openPalette(page: Page): Promise<void> {
  await baseExpect(async () => {
    await page.keyboard.press("ControlOrMeta+k");
    await baseExpect(page.getByPlaceholder(PALETTE_INPUT)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

export async function openDialog(page: Page, trigger: Locator): Promise<void> {
  await baseExpect(async () => {
    await trigger.click();
    await baseExpect(page.getByRole("dialog")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

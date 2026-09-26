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

/* Opens a ConfirmDelete and presses its confirm button. The trigger and the confirmation carry
   the same label, so a click that lands before hydration leaves the second click hitting the
   trigger again instead of confirming. */
export async function confirmDelete(page: Page, trigger: Locator, label = "Delete"): Promise<void> {
  const dialog = page.getByRole("alertdialog");
  await baseExpect(async () => {
    await trigger.click();
    await baseExpect(dialog).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await dialog.getByRole("button", { name: label, exact: true }).click();
}

/* Presses the palette shortcut until it opens. Same hydration guard as openDialog: a keypress
   that lands before the client component hydrates is dropped silently. */
export async function openPalette(page: Page): Promise<void> {
  await baseExpect(async () => {
    await page.keyboard.press("ControlOrMeta+k");
    await baseExpect(page.getByPlaceholder(PALETTE_INPUT)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

/* Clicks a trigger until its dialog shows. Guards against a click landing before hydration
   on a cold dev server, which drops the handler silently. */
export async function openDialog(page: Page, trigger: Locator): Promise<void> {
  await baseExpect(async () => {
    await trigger.click();
    await baseExpect(page.getByRole("dialog")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

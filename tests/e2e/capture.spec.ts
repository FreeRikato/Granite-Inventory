import { expect, test, ensureTestUsers, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";
import { sql } from "../seam/harness";

const PAGES = ["/", "/inward", "/sell", "/yard", "/customers", "/public-link", "/settings", "/login", "/catalog"];

test.beforeAll(async () => {
  await ensureTestUsers();
});

test("capture every page", async ({ page, signIn }, testInfo) => {
  test.skip(!process.env.CAPTURE, "set CAPTURE=1 to capture");
  await resetDomainData();
  await seedYard();
  await sql(`update public.settings set catalog_public = true, whatsapp_number = '+91 98765 43210'`);
  await signIn("admin");
  for (const path of PAGES) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const name = path === "/" ? "overview" : path.slice(1).replace(/\//g, "-");
    await page.screenshot({ path: `${process.env.CAPTURE}/${testInfo.project.name}-${name}.png`, fullPage: true });
    if (path === "/") {
      await page.getByRole("button", { name: "Ask", exact: true }).click();
      const panel = page.getByTestId("chat-panel");
      await panel.getByRole("textbox", { name: "Ask a question" }).fill("stale by supplier");
      await panel.getByRole("button", { name: "Send" }).click();
      await expect(panel.locator("[data-slot='chart']")).toBeVisible();
      await page.screenshot({ path: `${process.env.CAPTURE}/${testInfo.project.name}-overview-ask.png` });
    }
  }
});

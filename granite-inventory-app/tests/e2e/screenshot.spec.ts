import { test, ensureTestUsers, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";
import { sql } from "../seam/harness";

/* Not a test of behaviour: captures pages for a side-by-side check against the Pencil designs.
   Run with: pnpm exec playwright test screenshot --project=desktop */
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
  }
});

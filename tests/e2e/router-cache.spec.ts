import { expect, test, ensureTestUsers, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";
import type { Page, Request } from "@playwright/test";

function isServerRender(request: Request, pathname: string): boolean {
  const url = new URL(request.url());
  return (
    url.pathname === pathname &&
    request.headers()["rsc"] === "1" &&
    request.headers()["next-router-prefetch"] === undefined
  );
}

function countServerRenders(page: Page, pathname: string): { readonly count: () => number } {
  let count = 0;
  page.on("request", (request) => {
    if (isServerRender(request, pathname)) count += 1;
  });
  return { count: () => count };
}

test.describe("router cache", () => {
  test.beforeAll(async () => {
    await ensureTestUsers();
  });

  test.beforeEach(async () => {
    await resetDomainData();
    await seedYard();
  });

  test("revisiting Yard Slots within the stale window does not re-render on the server", async ({
    page,
    signIn,
  }, testInfo) => {
    testInfo.skip(testInfo.project.name !== "desktop", "Navigation caching is covered on desktop only");
    await signIn("admin");
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

    const yardRenders = countServerRenders(page, "/yard");

    await page.getByRole("link", { name: "Yard Slots" }).click();
    await expect(page.getByRole("heading", { name: "Yard Slots" })).toBeVisible();
    expect(yardRenders.count()).toBe(1);

    await page.getByRole("link", { name: "Overview" }).click();
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

    await page.getByRole("link", { name: "Yard Slots" }).click();
    await expect(page.getByRole("heading", { name: "Yard Slots" })).toBeVisible();
    expect(yardRenders.count()).toBe(1);
  });
});

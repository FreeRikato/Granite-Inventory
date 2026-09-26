import { expect, test, ensureTestUsers } from "./fixtures";

test.beforeAll(async () => {
  await ensureTestUsers();
});

test("anonymous visitor is sent to the login page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByText("Access is limited to approved team members.")).toBeVisible();
});

test("a signed-in stranger sees the not-approved message and no data", async ({ page, signIn }) => {
  await signIn("stranger");
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText(/is not an approved team member/)).toBeVisible();
});

test("a team member lands on Overview inside the shell", async ({ page, signIn }) => {
  await signIn("admin");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Inward Stock" }).or(
    page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Inward" }),
  )).toBeVisible();
});

import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { ensureTestUsers, TEST_USERS } from "../seam/harness";

for (const who of ["admin", "operator"] as const) {
  test.setup(`sign in as ${who}`, { sessions: [who] }, async ({ app, browser, screen, session }) => {
    await ensureTestUsers();
    await app.open("/login");
    const status = await browser.evaluate(
      async (email: string) =>
        (
          await fetch("/auth/test-login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email, password: "test-password-123" }),
          })
        ).status,
      TEST_USERS[who].email,
    );
    expect(status).toBe(200);
    await app.open("/");
    await expect(screen.getByRole("heading", "Overview")).toBeVisible();
    await session.save(who);
  });
}

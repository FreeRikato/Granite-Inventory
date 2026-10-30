import type { Page } from "@playwright/test";
import { expect, test, confirmDelete, ensureTestUsers, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";
import { sql } from "../seam/harness";

test.beforeAll(async () => {
  await ensureTestUsers();
});

test.skip(({ isMobile }) => isMobile, "Write motion does not depend on the viewport");

async function holdWrites(page: Page, path: string): Promise<() => void> {
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    (url) => url.pathname === path,
    async (route) => {
      if (route.request().method() === "POST") await released;
      await route.continue();
    },
  );
  return release;
}

test.describe("archive is optimistic", () => {
  test.beforeEach(async () => {
    await resetDomainData();
    await seedYard();
  });

  test("the archived state shows before the server answers", async ({ page, signIn }) => {
    await signIn("admin");
    await page.goto("/yard?archived=1");
    const card = page.getByTestId("yard-batch").filter({ hasText: "JB-FIVE-01" });
    await expect(card.getByText("Archived", { exact: true })).toHaveCount(0);
    const release = await holdWrites(page, "/yard");

    await card.getByRole("button", { name: "Archive JB-FIVE-01", exact: true }).click();
    await expect(card.getByText("Archived", { exact: true })).toBeVisible();
    await expect(page.getByText("Batch JB-FIVE-01 archived")).toHaveCount(0);

    release();
    await expect(page.getByText("Batch JB-FIVE-01 archived")).toBeVisible();
    await expect(card.getByText("Archived", { exact: true })).toBeVisible();
  });

  test("a refusal puts the batch back and gives the reason", async ({ page, signIn }) => {
    await signIn("admin");
    await page.goto("/yard?archived=1");
    const card = page.getByTestId("yard-batch").filter({ hasText: "JB-FIVE-01" });
    await expect(card).toBeVisible();
    await sql(`delete from public.batches where batch_code = 'JB-FIVE-01'`);
    const release = await holdWrites(page, "/yard");
    await page.route("**/rest/v1/v_yard_batches*", () => {});

    await card.getByRole("button", { name: "Archive JB-FIVE-01", exact: true }).click();
    await expect(card.getByText("Archived", { exact: true })).toBeVisible();

    release();
    await expect(page.getByText("Unknown batch")).toBeVisible();
    await expect(card.getByText("Archived", { exact: true })).toHaveCount(0);
    await expect(card.getByRole("button", { name: "Archive JB-FIVE-01", exact: true })).toBeEnabled();
  });

  test("a refusal refetches what the archive cancelled", async ({ page, signIn }) => {
    await signIn("admin");
    await page.goto("/yard?archived=1");
    const card = page.getByTestId("yard-batch").filter({ hasText: "JB-FIVE-01" });
    await expect(card).toBeVisible();
    await sql(`delete from public.batches where batch_code = 'JB-FIVE-01'`);
    const release = await holdWrites(page, "/yard");

    await card.getByRole("button", { name: "Archive JB-FIVE-01", exact: true }).click();
    await expect(card.getByText("Archived", { exact: true })).toBeVisible();

    release();
    await expect(page.getByText("Unknown batch")).toBeVisible();
    await expect(card).toHaveCount(0);
  });
});

test.describe("archive when the connection drops", () => {
  test.beforeEach(async () => {
    await resetDomainData();
    await seedYard();
  });

  test("the batch comes back with a toast", async ({ page, signIn }) => {
    await signIn("admin");
    await page.goto("/yard?archived=1");
    const card = page.getByTestId("yard-batch").filter({ hasText: "JB-FIVE-01" });
    await expect(card).toBeVisible();
    await page.route(
      (url) => url.pathname === "/yard",
      (route) => (route.request().method() === "POST" ? route.abort("failed") : route.continue()),
    );

    const refetched = page.waitForRequest(
      (request) => request.method() === "GET" && request.url().includes("/rest/v1/v_yard_batches"),
      { timeout: 5_000 },
    );

    await card.getByRole("button", { name: "Archive JB-FIVE-01", exact: true }).click();

    await expect(page.locator("[data-sonner-toast][data-type='error']")).toBeVisible();
    await expect(card.getByText("Archived", { exact: true })).toHaveCount(0);
    await refetched;
  });
});

test.describe("deletes wait for the server", () => {
  test.beforeEach(async () => {
    await resetDomainData();
    await seedYard();
    await sql(`update public.batches set archived_at = now() where batch_code = 'JB-FIVE-01'`);
  });

  test("a deleted batch is dimmed with a spinner until the server answers, then gone", async ({ page, signIn }) => {
    await signIn("admin");
    await page.goto("/yard?archived=1");
    const card = page.getByTestId("yard-batch").filter({ hasText: "JB-FIVE-01" });
    await expect(card).toBeVisible();
    const release = await holdWrites(page, "/yard");
    await page.route("**/rest/v1/v_yard_batches*", () => {});

    await confirmDelete(page, card.getByRole("button", { name: "Delete" }));
    await expect(card.locator('[data-row-state="pending"]')).toHaveCount(1);
    await expect(card).toHaveCSS("opacity", "0.4");
    await expect(card.locator('[data-slot="spinner"]')).toHaveCount(1);
    await expect(page.getByText("Batch JB-FIVE-01 deleted")).toHaveCount(0);

    release();
    await expect(page.getByText("Batch JB-FIVE-01 deleted")).toBeVisible();
    await expect(card).toHaveCount(0);
  });

  test("a refused delete leaves the row in place and gives the reason", async ({ page, signIn }) => {
    await signIn("admin");
    await page.goto("/yard?archived=1");
    const card = page.getByTestId("yard-batch").filter({ hasText: "JB-FIVE-01" });
    await expect(card).toBeVisible();
    await sql(`update public.batches set archived_at = null where batch_code = 'JB-FIVE-01'`);
    const release = await holdWrites(page, "/yard");

    await confirmDelete(page, card.getByRole("button", { name: "Delete" }));
    await expect(card.locator('[data-row-state="pending"]')).toHaveCount(1);

    release();
    await expect(page.getByText("Archive batch JB-FIVE-01 before deleting it")).toBeVisible();
    await expect(card.locator('[data-row-state="idle"]')).toHaveCount(1);
    await expect(card).toHaveCSS("opacity", "0.6");
  });
});

async function dropActionPosts(page: Page, path: string) {
  await page.route(
    (url) => url.pathname === path,
    (route) => (route.request().method() === "POST" ? route.abort("failed") : route.continue()),
  );
}

async function expectToastInsteadOfCrash(page: Page) {
  const toast = page.locator("[data-sonner-toast][data-type='error']");
  await expect(toast).toBeVisible();
  await expect(toast).not.toBeEmpty();
  await expect(page.getByText(/This page couldn[\u2019']t load/)).toHaveCount(0);
}

async function dropActionAnswers(page: Page, path: string) {
  await page.route(
    (url) => url.pathname === path,
    async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await route.fetch();
      return route.abort("failed");
    },
  );
}

async function seedSale() {
  await sql(
    `insert into public.customers (name, phone, customer_type) values ('Murugan Constructions', '+91 98765 43210', 'CONTRACTOR')`,
  );
  await sql(`insert into public.sales (sale_date, batch_id, customer_id, quantity, sale_rate, area_sqft, landed_cost, payment_mode)
    select private.ist_today() - 3, b.id, c.id, 2, 1650 / coalesce(b.length_ft * b.breadth_ft, 1), b.length_ft * b.breadth_ft, 1450, 'CASH' from public.batches b, public.customers c
    where b.batch_code = 'BP-OLD-01' and c.name = 'Murugan Constructions'`);
  await sql(`update public.batches set units_sold = units_sold + 2 where batch_code = 'BP-OLD-01'`);
  const [customer] = await sql<{ id: string }>(`select id from public.customers where name = 'Murugan Constructions'`);
  return customer?.id ?? "";
}

test.describe("a write that never reaches the server", () => {
  test.beforeEach(async () => {
    await resetDomainData();
    await seedYard();
  });

  test("deleting a Sale keeps the row and toasts", async ({ page, signIn }) => {
    const customerId = await seedSale();
    await signIn("admin");
    await page.goto(`/customers/${customerId}`);
    const row = page.getByTestId("sale-row");
    await expect(row).toHaveCount(1);
    await dropActionPosts(page, `/customers/${customerId}`);

    await confirmDelete(page, row.getByRole("button", { name: "Delete" }));

    await expectToastInsteadOfCrash(page);
    await expect(row).toHaveCount(1);
    await expect(row.locator('[data-row-state="idle"]')).toHaveCount(1);
  });

  test("deleting a customer keeps the page and toasts", async ({ page, signIn }) => {
    const [customer] = await sql<{ id: string }>(
      `insert into public.customers (name, customer_type) values ('Throwaway Customer', 'REGULAR') returning id`,
    );
    await signIn("admin");
    await page.goto(`/customers/${customer?.id}`);
    const heading = page.getByRole("heading", { name: "Throwaway Customer" });
    await expect(heading).toBeVisible();
    await dropActionPosts(page, `/customers/${customer?.id}`);

    await confirmDelete(page, page.getByRole("button", { name: "Delete" }));

    await expectToastInsteadOfCrash(page);
    await expect(heading).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete" })).toBeEnabled();
  });

  test("deleting a batch keeps the card and toasts", async ({ page, signIn }) => {
    await sql(`update public.batches set archived_at = now() where batch_code = 'JB-FIVE-01'`);
    await signIn("admin");
    await page.goto("/yard?archived=1");
    const card = page.getByTestId("yard-batch").filter({ hasText: "JB-FIVE-01" });
    await expect(card).toBeVisible();
    await dropActionPosts(page, "/yard");

    await confirmDelete(page, card.getByRole("button", { name: "Delete" }));

    await expectToastInsteadOfCrash(page);
    await expect(card).toHaveCount(1);
    await expect(card.locator('[data-row-state="idle"]')).toHaveCount(1);
  });

  test("recording a Sale keeps the order and toasts", async ({ page, signIn }) => {
    await signIn("operator");
    await page.goto("/sell");
    await page.getByRole("combobox", { name: "Customer" }).click();
    await page.getByRole("option", { name: /Walk-in Customer/ }).click();
    await page.getByRole("combobox", { name: "Product" }).click();
    await page.getByRole("option", { name: /Black Pearl · 4×2 ft, 16mm/ }).click();
    await page.getByLabel("Stone Sale Price (₹)").fill("206.25");
    await page.getByRole("button", { name: "Add to order" }).click();
    const line = page.getByTestId("cart-line");
    await expect(line).toHaveCount(1);
    await dropActionPosts(page, "/sell");

    await page.getByRole("button", { name: "Record Sale" }).click();

    await expectToastInsteadOfCrash(page);
    await expect(line).toHaveCount(1);
    await expect(line.locator('[data-row-state="idle"]')).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Record Sale" })).toBeEnabled();
  });
});

test.describe("a write the server committed but never answered", () => {
  test.beforeEach(async () => {
    await resetDomainData();
    await seedYard();
  });

  test("recording a Sale shows the stock it used", async ({ page, signIn }) => {
    await signIn("operator");
    await page.goto("/sell");
    await page.getByRole("combobox", { name: "Customer" }).click();
    await page.getByRole("option", { name: /Walk-in Customer/ }).click();
    await page.getByRole("combobox", { name: "Product" }).click();
    await expect(page.getByRole("option", { name: /Black Pearl · 4×2 ft, 16mm.*14 available/ })).toBeVisible();
    await page.getByRole("option", { name: /Black Pearl · 4×2 ft, 16mm/ }).click();
    await page.getByLabel("Stone Sale Price (₹)").fill("206.25");
    await page.getByLabel("Quantity Sold").fill("2");
    await page.getByRole("button", { name: "Add to order" }).click();
    await expect(page.getByTestId("cart-line")).toHaveCount(1);
    await dropActionAnswers(page, "/sell");

    await page.getByRole("button", { name: "Record Sale" }).click();

    await expectToastInsteadOfCrash(page);
    await page
      .getByTestId("cart-line")
      .getByRole("button", { name: /^Remove Black Pearl/ })
      .click();
    await expect(page.getByTestId("cart-line")).toHaveCount(0);
    await page.getByRole("combobox", { name: "Product" }).click();
    await expect(page.getByRole("option", { name: /Black Pearl · 4×2 ft, 16mm.*12 available/ })).toBeVisible();
  });

  test("deleting a batch drops the card", async ({ page, signIn }) => {
    await sql(`update public.batches set archived_at = now() where batch_code = 'JB-FIVE-01'`);
    await signIn("admin");
    await page.goto("/yard?archived=1");
    const card = page.getByTestId("yard-batch").filter({ hasText: "JB-FIVE-01" });
    await expect(card).toBeVisible();
    await dropActionAnswers(page, "/yard");

    await confirmDelete(page, card.getByRole("button", { name: "Delete" }));

    await expectToastInsteadOfCrash(page);
    await expect(card).toHaveCount(0);
  });
});

test.describe("a deleted Sale", () => {
  test.beforeEach(async () => {
    await resetDomainData();
    await seedYard();
  });

  test("fades out before it leaves the page", async ({ page, signIn }) => {
    const customerId = await seedSale();
    await signIn("admin");
    await page.goto(`/customers/${customerId}`);
    const row = page.getByTestId("sale-row");
    await expect(row).toHaveCount(1);
    await page.evaluate(() => {
      const seen: number[] = [];
      Object.assign(window, { seen });
      const sample = () => {
        const watched = document.querySelector("[data-testid='sale-row']");
        if (watched) seen.push(Number(getComputedStyle(watched).opacity));
        else if (seen.length > 0) return;
        requestAnimationFrame(sample);
      };
      sample();
    });

    await confirmDelete(page, row.getByRole("button", { name: "Delete" }));
    await expect(row).toHaveCount(0);

    const seen: number[] = await page.evaluate(() => Reflect.get(window, "seen"));
    expect(Math.min(...seen)).toBeLessThanOrEqual(0.05);
  });
});

test.describe("batch actions on Inward", () => {
  test.beforeEach(async () => {
    await resetDomainData();
    await seedYard();
  });

  test("archiving marks the recent batch before the server answers", async ({ page, signIn }) => {
    await signIn("admin");
    await page.goto("/inward");
    const row = page.getByTestId("batch-row").filter({ hasText: "BP-NEW-01" });
    await expect(row).toBeVisible();
    await expect(row.getByText("Archived", { exact: true })).toHaveCount(0);
    const release = await holdWrites(page, "/inward");

    await row.getByRole("button", { name: "Archive BP-NEW-01", exact: true }).click();
    await expect(row.getByText("Archived", { exact: true })).toBeVisible();
    await expect(page.getByText("Batch BP-NEW-01 archived")).toHaveCount(0);

    release();
    await expect(page.getByText("Batch BP-NEW-01 archived")).toBeVisible();
  });

  test("a deleted recent batch leaves no hidden row behind", async ({ page, signIn }) => {
    await sql(`update public.batches set archived_at = now() where batch_code = 'JB-FIVE-01'`);
    await signIn("admin");
    await page.goto("/inward");
    await page.getByRole("switch", { name: "Show archived" }).click();
    const row = page.getByTestId("batch-row").filter({ hasText: "JB-FIVE-01" });
    await expect(row).toBeVisible();
    await page.route("**/rest/v1/v_batches*", () => {});

    await confirmDelete(page, row.getByRole("button", { name: "Delete JB-FIVE-01" }));

    await expect(page.getByText("Batch JB-FIVE-01 deleted")).toBeVisible();
    await expect(row).toHaveCount(0);
  });
});

test.describe("the order", () => {
  test.beforeEach(async () => {
    await resetDomainData();
    await seedYard();
  });

  test("lines dim with a spinner while the sale is recorded, then leave the order", async ({ page, signIn }) => {
    await signIn("operator");
    await page.goto("/sell");
    await page.getByRole("combobox", { name: "Customer" }).click();
    await page.getByRole("option", { name: /Walk-in Customer/ }).click();
    await page.getByRole("combobox", { name: "Product" }).click();
    await page.getByRole("option", { name: /Black Pearl · 4×2 ft, 16mm/ }).click();
    await page.getByLabel("Stone Sale Price (₹)").fill("206.25");
    await page.getByRole("button", { name: "Add to order" }).click();
    const line = page.getByTestId("cart-line");
    await expect(line).toHaveCount(1);
    const release = await holdWrites(page, "/sell");

    await page.getByRole("button", { name: "Record Sale" }).click();
    await expect(line.locator('[data-row-state="pending"]')).toHaveCount(1);
    await expect(line.locator('[data-slot="spinner"]')).toHaveCount(1);

    release();
    await expect(page.getByText(/Sale recorded/)).toBeVisible();
    await expect(line).toHaveCount(0);
  });

  test("removing a line updates the totals at once, fades the line, then removes it", async ({ page, signIn }) => {
    await signIn("operator");
    await page.clock.install();
    await page.goto("/sell");
    await page.getByRole("combobox", { name: "Product" }).click();
    await page.getByRole("option", { name: /Black Pearl · 4×2 ft, 16mm/ }).click();
    await page.getByLabel("Stone Sale Price (₹)").fill("206.25");
    await page.getByRole("button", { name: "Add to order" }).click();
    const line = page.getByTestId("cart-line");
    await expect(page.getByTestId("order-count")).toBeVisible();
    await page.getByRole("combobox", { name: "Product" }).click();
    await page.getByRole("option", { name: /Black Pearl · 4×2 ft, 16mm/ }).click();
    await page.getByLabel("Stone Sale Price (₹)").fill("212.5");
    await expect(page.getByRole("button", { name: "Add to order" })).toBeEnabled();
    await page.clock.pauseAt(new Date(Date.now() + 5_000));

    await page.getByRole("button", { name: /^Remove Black Pearl/ }).click();
    await expect(page.getByTestId("order-count")).toHaveCount(0);
    await expect(line.locator('[data-row-state="leaving"]')).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Add to order" })).toBeDisabled();

    await page.clock.runFor(200);
    await expect(line).toHaveCount(0);
  });
});

test("archiving in the windowed yard keeps the cards around it where they were", async ({ page, signIn }) => {
  await resetDomainData();
  await sql(`insert into public.suppliers (name) values ('Windowing Quarry') on conflict do nothing`);
  await sql(`insert into public.products (name, abbreviation, category) values ('Windowing Pearl', 'WP', 'GRANITE')`);
  await sql(
    `insert into public.variants (product_id, name) select id, 'Grade 1' from public.products where name = 'Windowing Pearl'`,
  );
  await sql(`
    insert into public.batches (batch_code, variant_id, supplier_id, purchase_date, length_ft, breadth_ft, thickness_mm, slot, stack_number, initial_units, units_sold, unit_purchase_price, freight_cost)
    select 'WIN-' || g, v.id, s.id, private.ist_today() - (g % 300), 4, 2, 16, '4FT', ((g % 6) + 1)::text, 10, 0, 1400, 0
    from generate_series(1, 1200) g, public.variants v join public.products p on p.id = v.product_id, public.suppliers s
    where p.name = 'Windowing Pearl' and s.name = 'Windowing Quarry'`);
  await signIn("admin");
  await page.goto("/yard");
  await expect(page.getByTestId("yard-batch").first()).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 6000));
  await expect(async () => {
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(5000);
    expect(await page.getByTestId("yard-batch").count()).toBeGreaterThan(2);
  }).toPass();

  const tops = () =>
    page.getByTestId("yard-batch").evaluateAll((cards) =>
      cards.map((card) => ({
        code: card.getAttribute("data-batch-code") ?? "",
        top: Math.round(card.getBoundingClientRect().top),
        bottom: Math.round(card.getBoundingClientRect().bottom),
      })),
    );
  const layout = async () => JSON.stringify([await tops(), await page.evaluate(() => window.scrollY)]);
  await expect
    .poll(async () => {
      const first = await layout();
      await page.waitForTimeout(100);
      return first === (await layout());
    })
    .toBe(true);
  const before = await tops();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const target = before.find((card) => card.top > 0) ?? before[0];
  if (!target) throw new Error("no card in the window");
  const above = before.filter((card) => card.top < target.top);

  await page.getByRole("button", { name: `Archive ${target.code}`, exact: true }).click();
  await expect(page.getByText(`Batch ${target.code} archived`)).toBeVisible();

  const after = await tops();
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore)).toBeLessThanOrEqual(1);
  for (const card of above) {
    expect(after.find((other) => other.code === card.code)?.top).toBe(card.top);
  }
  const ordered = [...after].sort((a, b) => a.top - b.top);
  for (let i = 1; i < ordered.length; i += 1) {
    expect(ordered[i]?.top ?? 0).toBeGreaterThanOrEqual(ordered[i - 1]?.bottom ?? 0);
  }
});

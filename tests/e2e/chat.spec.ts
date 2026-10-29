import type { Page } from "@playwright/test";
import { expect, test, ensureTestUsers, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";
import { recordSale } from "../seam/fixtures";
import { signedInClient, sql } from "../seam/harness";

const CUSTOMER = "Sri Balaji Granites";
const QUESTION = "stale by supplier";

test.beforeAll(async () => {
  await ensureTestUsers();
});

test.beforeEach(async () => {
  await resetDomainData();
  await seedYard();
  await sql(`insert into public.customers (name, customer_type) values ('${CUSTOMER}', 'CONTRACTOR')`);
});

async function openPanel(page: Page) {
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByTestId("chat-panel")).toBeVisible();
}

async function storedThread(page: Page, email: string): Promise<unknown> {
  return page.evaluate(
    (key) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("keyval-store");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const read = open.result.transaction("keyval").objectStore("keyval").get(key);
          read.onerror = () => reject(read.error);
          read.onsuccess = () => resolve(read.result);
        };
      }),
    `granite-chat:${email}`,
  );
}

async function ask(page: Page, question: string) {
  const panel = page.getByTestId("chat-panel");
  await panel.getByRole("textbox", { name: "Ask a question" }).fill(question);
  await panel.getByRole("button", { name: "Send" }).click();
}

test("ask opens a side panel, answers with a chart and a real name, keeps the thread per member and clears on new chat", async ({
  page,
  signIn,
}, testInfo) => {
  const mobile = testInfo.project.name === "mobile";
  const panel = page.getByTestId("chat-panel");
  await signIn("operator");
  await page.goto("/");
  const stockCard = page.getByTestId("kpi-active");
  await expect(stockCard).toBeVisible();
  const widthBefore = (await page.locator("main > div").boundingBox())?.width ?? 0;

  await openPanel(page);
  const viewport = page.viewportSize();
  const box = await panel.boundingBox();
  if (mobile) {
    expect(box?.width).toBe(viewport?.width);
    expect(box?.height).toBe(viewport?.height);
  } else {
    expect(box?.width).toBe(380);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBe(viewport?.width);
    await expect(stockCard).toBeVisible();
    const widthAfter = (await page.locator("main > div").boundingBox())?.width ?? 0;
    expect(widthAfter).toBeLessThan(widthBefore);
  }

  await panel.getByRole("textbox", { name: "Ask a question" }).press("Enter");
  await expect(panel.getByTestId("chat-user-message")).toHaveCount(0);

  await ask(page, QUESTION);
  await expect(panel.getByTestId("chat-user-message")).toHaveText(QUESTION);
  await expect(panel.locator("[data-slot='chart']")).toBeVisible();
  await expect(panel.getByText(`${CUSTOMER} bought the most Black Pearl`)).toBeVisible();
  await expect.poll(() => storedThread(page, "operator@test.local")).toBeDefined();

  await page.goto("/yard");
  await page.goto("/");
  await expect(page.getByTestId("kpi-active")).toBeVisible();
  await expect(page.getByTestId("chat-panel")).toBeHidden();
  await openPanel(page);
  await expect(panel.getByTestId("chat-user-message")).toHaveText(QUESTION);
  await expect(panel.locator("[data-slot='chart']")).toBeVisible();
  await expect(panel.getByText(`${CUSTOMER} bought the most Black Pearl`)).toBeVisible();

  await signIn("admin");
  await page.goto("/");
  await openPanel(page);
  await expect(panel.getByTestId("chat-user-message")).toHaveCount(0);

  await signIn("operator");
  await page.goto("/");
  await openPanel(page);
  await expect(panel.getByTestId("chat-user-message")).toHaveText(QUESTION);

  await panel.getByRole("button", { name: "New chat" }).click();
  await expect(panel.getByTestId("chat-user-message")).toHaveCount(0);
  await expect(panel.locator("[data-slot='chart']")).toHaveCount(0);
  await expect.poll(() => storedThread(page, "operator@test.local")).toBeUndefined();
  await page.reload();
  await openPanel(page);
  await expect(panel.getByTestId("chat-user-message")).toHaveCount(0);
});

test("a second question after coming back is answered from the saved thread", async ({ page, signIn }) => {
  const panel = page.getByTestId("chat-panel");
  await signIn("operator");
  await page.goto("/");
  await openPanel(page);
  await ask(page, QUESTION);
  await expect(panel.locator("[data-slot='chart']")).toBeVisible();

  await page.goto("/yard");
  await page.goto("/");
  await openPanel(page);
  await ask(page, "and again");
  await expect(panel.getByTestId("chat-user-message")).toHaveCount(2);
  await expect(panel.locator("[data-slot='chart']")).toHaveCount(2);
});

test("the input is disabled with a reason while the browser is offline", async ({ page, context, signIn }) => {
  const panel = page.getByTestId("chat-panel");
  const input = panel.getByRole("textbox", { name: "Ask a question" });
  await signIn("operator");
  await page.goto("/");
  await openPanel(page);
  await expect(input).toBeEnabled();

  await context.setOffline(true);
  await expect(input).toBeDisabled();
  await expect(panel.getByText("You are offline, chat needs a connection")).toBeVisible();

  await context.setOffline(false);
  await expect(input).toBeEnabled();
});

test("a failed answer shows as a plain message in the thread", async ({ page, signIn }) => {
  const panel = page.getByTestId("chat-panel");
  await signIn("operator");
  await page.goto("/");
  await openPanel(page);

  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Chat is not set up yet" }),
    }),
  );
  await ask(page, QUESTION);
  await expect(panel.getByTestId("chat-error")).toHaveText("Chat is not set up yet");

  await page.unroute("**/api/chat");
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" },
      body: `data: ${JSON.stringify({ type: "error", errorText: "Daily limit reached, try again after 5:30 AM" })}\n\ndata: [DONE]\n\n`,
    }),
  );
  await ask(page, "again");
  await expect(panel.getByTestId("chat-error")).toHaveText("Daily limit reached, try again after 5:30 AM");
});

const SHEET_WIDTH = 1024;
const DOCK_WIDTH = 1280;
const WIDE_WIDTH = 1440;

type Overflow = { readonly overlaps: string[]; readonly pastPanel: string[]; readonly clipped: string[] };

async function measureDashboard(page: Page, panelLeft: number): Promise<Overflow> {
  return page.evaluate((left) => {
    const cards = [...document.querySelectorAll("main > div section, main > div > div > div")].filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el.getBoundingClientRect().height > 0,
    );
    const rects = cards.map((el) => ({ el, rect: el.getBoundingClientRect() }));
    const label = (el: HTMLElement) => el.textContent?.trim().slice(0, 24) ?? "";
    const overlaps = rects.flatMap((a, i) =>
      rects.slice(i + 1).flatMap((b) => {
        if (a.el.contains(b.el) || b.el.contains(a.el)) return [];
        const x = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
        const y = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
        return x > 1 && y > 1 ? [`${label(a.el)} | ${label(b.el)}`] : [];
      }),
    );
    const pastPanel = rects.filter(({ rect }) => rect.right > left + 0.5).map(({ el }) => label(el));
    const clipped = [...document.querySelectorAll("main section")].flatMap((card) => {
      const cardRight = card.getBoundingClientRect().right;
      return [...card.querySelectorAll("*")]
        .filter((el) => [...el.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()))
        .filter((el) => {
          const text = document.createRange();
          text.selectNodeContents(el);
          const right = text.getBoundingClientRect().right;
          const truncates = getComputedStyle(el).textOverflow === "ellipsis";
          return right > cardRight + 0.5 || right > left + 0.5 || (!truncates && el.scrollWidth > el.clientWidth + 0.5);
        })
        .map((el) => `${label(card as HTMLElement)} > ${el.textContent?.trim().slice(0, 24)}`);
    });
    return { overlaps, pastPanel, clipped };
  }, panelLeft);
}

async function expectOverviewCardsLoaded(page: Page): Promise<void> {
  await expect(page.getByTestId("margin-card").getByTestId("margin-bar").first()).toBeVisible();
  await expect(page.getByTestId("top-customers-card").getByTestId("top-customer-row").first()).toBeVisible();
  await expect(page.getByTestId("kpi-revenue")).toBeVisible();
}

test("below 1280px the panel is a full-screen sheet, from 1280px it docks and leaves the dashboard usable", async ({
  page,
  signIn,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "needs a desktop browser to resize");
  const panel = page.getByTestId("chat-panel");
  const operator = await signedInClient("operator");
  const [customer] = await sql<{ id: string }>(`select id from public.customers where name = '${CUSTOMER}'`);
  const batches = await sql<{ id: string }>(
    `select id from public.batches where batch_code in ('BP-NEW-01', 'JB-FIVE-01') order by batch_code`,
  );
  for (const batch of batches) await recordSale(operator, { batchId: batch.id, customerId: customer.id, quantity: 2 });
  await signIn("operator");

  await page.setViewportSize({ width: SHEET_WIDTH, height: 768 });
  await page.goto("/");
  await expect(page.getByTestId("kpi-active")).toBeVisible();
  await openPanel(page);
  const sheet = await panel.boundingBox();
  expect(sheet).toMatchObject({ x: 0, y: 0, width: SHEET_WIDTH, height: 768 });

  await page.setViewportSize({ width: DOCK_WIDTH, height: 800 });
  await page.reload();
  await expect(page.getByTestId("kpi-active")).toBeVisible();
  await openPanel(page);
  const docked = await panel.boundingBox();
  expect(docked).toMatchObject({ x: DOCK_WIDTH - 380, width: 380 });

  const ask = page.getByRole("button", { name: "Ask", exact: true });
  const askBox = await ask.boundingBox();
  expect((askBox?.x ?? 0) + (askBox?.width ?? 0)).toBeLessThanOrEqual(DOCK_WIDTH - 380);
  const topElementIsAsk = await ask.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return el.contains(hit);
  });
  expect(topElementIsAsk).toBe(true);

  await expectOverviewCardsLoaded(page);
  expect(await measureDashboard(page, DOCK_WIDTH - 380)).toEqual({ overlaps: [], pastPanel: [], clipped: [] });

  await page.setViewportSize({ width: WIDE_WIDTH, height: 800 });
  await expect(panel).toBeVisible();
  await expectOverviewCardsLoaded(page);
  expect(await measureDashboard(page, WIDE_WIDTH - 380)).toEqual({ overlaps: [], pastPanel: [], clipped: [] });
});

test("a Metric value fits its card in the docked panel", async ({ page, signIn }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "needs the docked panel");
  const panel = page.getByTestId("chat-panel");
  const reply = [
    "root = Stack([a, b])",
    'a = Metric("Total inventory value", 987654321012, "rupees")',
    'b = Metric("Units sold", 123456789012345, "number")',
  ].join("\n");
  const chunks = [
    { type: "start" },
    { type: "text-start", id: "t" },
    { type: "text-delta", id: "t", delta: reply },
    { type: "text-end", id: "t" },
    { type: "finish" },
  ];
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" },
      body: `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`,
    }),
  );
  await page.setViewportSize({ width: 1440, height: 800 });
  await signIn("operator");
  await page.goto("/");
  await openPanel(page);
  await ask(page, "totals");
  await expect(panel.getByText("Units sold")).toBeVisible();

  const fits = await panel.evaluate((root) =>
    [...root.querySelectorAll("span.tabular")].map((value) => {
      const card = value.parentElement?.getBoundingClientRect();
      const text = document.createRange();
      text.selectNodeContents(value);
      const used = text.getBoundingClientRect();
      return used.right <= (card?.right ?? 0) && value.scrollWidth <= value.clientWidth;
    }),
  );
  expect(fits).toEqual([true, true]);
});

type Chunk = Record<string, unknown>;

function streamResponse(chunks: Chunk[]) {
  return {
    status: 200,
    headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" },
    body: `${[{ type: "start" }, ...chunks, { type: "finish" }].map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`,
  };
}

const queryChunks = (rows: number): Chunk[] => [
  { type: "tool-input-available", toolCallId: "call-1", toolName: "run_query", input: { sql: "select 1" } },
  {
    type: "tool-output-available",
    toolCallId: "call-1",
    output: Array.from({ length: rows }, (_, i) => ({ marker: `EARLIER-ROW-${i}` })),
  },
];

const textChunks = (text: string): Chunk[] => [
  { type: "text-start", id: "t" },
  { type: "text-delta", id: "t", delta: text },
  { type: "text-end", id: "t" },
];

test("a turn that ends on tool calls that returned nothing says so in the thread", async ({ page, signIn }) => {
  const panel = page.getByTestId("chat-panel");
  await page.route("**/api/chat", (route) => route.fulfill(streamResponse(queryChunks(0))));
  await signIn("operator");
  await page.goto("/");
  await openPanel(page);
  await ask(page, "units sold per product as a chart");
  await expect(panel.getByTestId("chat-no-answer")).toHaveText(
    "I could not finish that answer. Try asking a narrower question.",
  );
  await expect(panel.getByTestId("chat-error")).toHaveCount(0);
});

test("a turn that ends on raw tool-call text shows the rows it found as a table", async ({ page, signIn }) => {
  const panel = page.getByTestId("chat-panel");
  await page.route("**/api/chat", (route) =>
    route.fulfill(
      streamResponse([...queryChunks(3), ...textChunks("<tool_call>\n<function=run_query>\n</tool_call>")]),
    ),
  );
  await signIn("operator");
  await page.goto("/");
  await openPanel(page);
  await ask(page, "units sold per product as a chart");
  await expect(panel.getByText("Here is the data I found.")).toBeVisible();
  await expect(panel.getByRole("columnheader", { name: "marker" })).toBeVisible();
  await expect(panel.getByRole("cell", { name: "EARLIER-ROW-2" })).toBeVisible();
  await expect(panel.getByText("tool_call")).toHaveCount(0);
  await expect(panel.getByTestId("chat-no-answer")).toHaveCount(0);
});

test("an answer the model wrapped in prose and a code fence still renders", async ({ page, signIn }) => {
  const panel = page.getByTestId("chat-panel");
  const wrapped = 'Here you go:\n\n```openui\nroot = Stack([a])\na = Text("Fenced answer shown")\n```';
  await page.route("**/api/chat", (route) => route.fulfill(streamResponse(textChunks(wrapped))));
  await signIn("operator");
  await page.goto("/");
  await openPanel(page);
  await ask(page, "anything");
  await expect(panel.getByText("Fenced answer shown")).toBeVisible();
  await expect(panel.getByText("openui")).toHaveCount(0);
  await expect(panel.getByTestId("chat-no-answer")).toHaveCount(0);
});

test("a chat that is too long is refused by the route and says so in the thread", async ({ page, signIn }) => {
  const panel = page.getByTestId("chat-panel");
  await signIn("operator");
  await page.goto("/");
  await openPanel(page);
  await ask(page, "x".repeat(300 * 1024));
  await expect(panel.getByTestId("chat-error")).toHaveText("This chat is too long. Start a new chat.");
  await expect(panel.getByTestId("chat-no-answer")).toHaveCount(0);
});

test("a chart of five products names every bar, not every other one", async ({ page, signIn }) => {
  const panel = page.getByTestId("chat-panel");
  const products = ["Absolute Black", "Black Galaxy", "Kashmir White", "Steel Grey", "Tan Brown"];
  const chart = `root = Stack([c])\nc = BarChart(${JSON.stringify(products)}, [{name: "Jul", values: [4, 5, 6, 7, 8]}, {name: "Aug", values: [1, 2, 3, 4, 5]}])`;
  await page.route("**/api/chat", (route) => route.fulfill(streamResponse(textChunks(chart))));
  await signIn("operator");
  await page.goto("/");
  await openPanel(page);
  await ask(page, "units sold per product");
  const ticks = panel.locator(".recharts-cartesian-axis-tick-value");
  await expect(ticks).toHaveCount(products.length);
  await expect(ticks).toHaveText(products.map((name) => name.replaceAll(" ", "")));
});

test("the second question is sent without the rows of the first answer's query", async ({ page, signIn }) => {
  const panel = page.getByTestId("chat-panel");
  const bodies: string[] = [];
  await page.route("**/api/chat", (route) => {
    bodies.push(route.request().postData() ?? "");
    const reply = [
      { type: "text-start", id: "t" },
      { type: "text-delta", id: "t", delta: 'root = Stack([a])\na = Text("Done")' },
      { type: "text-end", id: "t" },
    ];
    return route.fulfill(streamResponse(bodies.length === 1 ? [...queryChunks(300), ...reply] : reply));
  });
  await signIn("operator");
  await page.goto("/");
  await openPanel(page);
  await ask(page, "first question");
  await expect(panel.getByText("Done")).toBeVisible();
  await ask(page, "second question");
  await expect(panel.getByTestId("chat-user-message")).toHaveCount(2);
  await expect.poll(() => bodies.length).toBe(2);

  expect(bodies[1]).toContain("first question");
  expect(bodies[1]).toContain("second question");
  expect(bodies[1]).not.toContain("EARLIER-ROW");
  expect(bodies[1]).not.toContain("tool-run_query");
});

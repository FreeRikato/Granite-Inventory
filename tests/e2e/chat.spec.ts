import { createServer } from "node:http";
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

const STAGE_MS = 700;

async function serveSlowAnswer(): Promise<{ readonly url: string; readonly close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    request.resume();
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "x-vercel-ai-ui-message-stream": "v1",
      "access-control-allow-origin": "*",
    });
    const send = (chunk: Chunk) => response.write(`data: ${JSON.stringify(chunk)}\n\n`);
    const pause = () => new Promise((resolve) => setTimeout(resolve, STAGE_MS));
    void (async () => {
      send({ type: "start" });
      await pause();
      send({ type: "tool-input-available", toolCallId: "slow-1", toolName: "run_query", input: { sql: "select 1" } });
      await pause();
      send({ type: "tool-output-available", toolCallId: "slow-1", output: [{ marker: "ROW" }] });
      await pause();
      send({ type: "text-start", id: "t" });
      send({ type: "text-delta", id: "t", delta: "Let me put that" });
      await pause();
      send({ type: "text-delta", id: "t", delta: " together.\nroot = Stack([a])\n" });
      await pause();
      send({ type: "text-delta", id: "t", delta: 'a = Text("Slow answer shown")\n' });
      send({ type: "text-end", id: "t" });
      send({ type: "finish" });
      response.end("data: [DONE]\n\n");
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

type Frame = { readonly phase: string | null; readonly content: number };

test("from send until the answer renders the assistant row shows each phase and is never empty", async ({
  page,
  signIn,
}) => {
  const panel = page.getByTestId("chat-panel");
  const slow = await serveSlowAnswer();
  try {
    await page.route("**/api/chat", (route) => route.continue({ url: slow.url }));
    await signIn("operator");
    await page.goto("/");
    await openPanel(page);

    await page.evaluate(() => {
      const frames: object[] = [];
      Object.assign(window, { phaseFrames: frames });
      const sample = () => {
        const phase = document.querySelector("[data-testid='chat-phase']")?.textContent ?? null;
        const content = [...document.querySelectorAll("[data-testid='chat-assistant-message']")].filter((el) =>
          [...el.children].some((child) => !child.matches("[data-testid='chat-phase']") && child.textContent?.trim()),
        ).length;
        frames.push({ phase, content });
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });

    await ask(page, "stale by supplier");
    await expect(panel.getByText("Slow answer shown")).toBeVisible();
    await page.waitForTimeout(200);

    const frames: Frame[] = await page.evaluate(() => Reflect.get(window, "phaseFrames"));
    const afterSend = frames.slice(frames.findIndex((frame) => frame.phase !== null));
    const firstContent = afterSend.findIndex((frame) => frame.content > 0);

    expect(new Set(afterSend.slice(0, firstContent).map((frame) => frame.phase))).toEqual(
      new Set(["Thinking...", "Querying your data...", "Writing the answer..."]),
    );
    expect(afterSend.slice(0, firstContent).filter((frame) => frame.phase === null)).toEqual([]);
    expect(afterSend.slice(firstContent).filter((frame) => frame.phase !== null)).toEqual([]);
    await expect(panel.getByTestId("chat-phase")).toHaveCount(0);
  } finally {
    await slow.close();
  }
});

test("a finished answer that drew nothing does not keep a phase line", async ({ page, signIn }) => {
  const panel = page.getByTestId("chat-panel");
  await page.route("**/api/chat", (route) => route.fulfill(streamResponse(textChunks("root = Stack([missing])"))));
  await signIn("operator");
  await page.goto("/");
  await openPanel(page);
  await ask(page, "anything");
  await expect(panel.getByRole("button", { name: "Send" })).toBeDisabled();
  await expect(panel.getByTestId("chat-user-message")).toHaveCount(1);
  await expect(panel.getByTestId("chat-phase")).toHaveCount(0);
});

type Script = ReadonlyArray<Chunk | number>;

async function serveScript(script: Script): Promise<{ readonly url: string; readonly close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    request.resume();
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "x-vercel-ai-ui-message-stream": "v1",
      "access-control-allow-origin": "*",
    });
    void (async () => {
      response.write(`data: ${JSON.stringify({ type: "start" })}\n\n`);
      for (const step of script) {
        if (typeof step === "number") await new Promise((resolve) => setTimeout(resolve, step));
        else response.write(`data: ${JSON.stringify(step)}\n\n`);
      }
      response.write(`data: ${JSON.stringify({ type: "finish" })}\n\n`);
      response.end("data: [DONE]\n\n");
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const delta = (text: string): Chunk => ({ type: "text-delta", id: "t", delta: text });

const LONG_LINES = 30;
const LINE_MS = 100;

const longAnswer: Script = [
  { type: "text-start", id: "t" },
  delta(`root = Stack([${Array.from({ length: LONG_LINES }, (_, i) => `a${i}`).join(", ")}])\n`),
  ...Array.from({ length: LONG_LINES }, (_, i) => [delta(`a${i} = Text("Line ${i}")\n`), LINE_MS] as const).flat(),
  { type: "text-end", id: "t" },
];

const tallTable = textChunks(
  `root = Stack([t])\nt = Table(["Row"], [${Array.from({ length: 12 }, (_, i) => `["Earlier ${i}"]`).join(", ")}])`,
);

test("scrolled up mid-stream the reader keeps their place, and the jump button returns to the latest", async ({
  page,
  signIn,
}) => {
  const panel = page.getByTestId("chat-panel");
  const viewport = panel.locator("[data-slot='message-scroller-viewport']");
  const slow = await serveScript([700, ...longAnswer]);
  try {
    let calls = 0;
    await page.route("**/api/chat", (route) => {
      calls += 1;
      return calls <= 3 ? route.fulfill(streamResponse(tallTable)) : route.continue({ url: slow.url });
    });
    await signIn("operator");
    await page.goto("/");
    await openPanel(page);
    for (const question of ["one", "two", "three"]) {
      await ask(page, question);
      await expect(panel.getByRole("button", { name: "Send" })).toBeDisabled();
      await expect(panel.getByTestId("chat-assistant-message")).toHaveCount(
        ["one", "two", "three"].indexOf(question) + 1,
      );
    }

    await ask(page, "four");
    await expect(panel.getByText("Line 3", { exact: true })).toBeVisible();
    await viewport.hover();
    await page.mouse.wheel(0, -100_000);
    await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBe(0);

    const samples: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      samples.push(await viewport.evaluate((el) => el.scrollTop));
      await page.waitForTimeout(100);
    }
    expect(Math.max(...samples) - Math.min(...samples)).toBeLessThanOrEqual(1);
    expect(await viewport.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(100);

    const jump = panel.getByTestId("chat-jump-latest");
    await expect(jump).toHaveAttribute("data-active", "true");
    await jump.click();
    await expect
      .poll(() => viewport.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop))
      .toBeLessThanOrEqual(8);
    await expect(jump).toHaveAttribute("data-active", "false");
  } finally {
    await slow.close();
  }
});

type JumpButtonMotion = {
  readonly top: number;
  readonly duration: string;
  readonly property: string;
  readonly timing: string;
};

async function jumpButtonMotion(page: Page): Promise<JumpButtonMotion> {
  const jump = page.getByTestId("chat-panel").getByTestId("chat-jump-latest");
  await jump.evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));
  return jump.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      top: Math.round(el.getBoundingClientRect().top),
      duration: style.transitionDuration,
      property: style.transitionProperty,
      timing: style.transitionTimingFunction,
    };
  });
}

async function readJumpButton(page: Page, signIn: (who: "operator") => Promise<void>) {
  const panel = page.getByTestId("chat-panel");
  const viewport = panel.locator("[data-slot='message-scroller-viewport']");
  await page.route("**/api/chat", (route) => route.fulfill(streamResponse(tallTable)));
  await signIn("operator");
  await page.goto("/");
  await openPanel(page);
  for (const [index, question] of ["one", "two", "three"].entries()) {
    await ask(page, question);
    await expect(panel.getByTestId("chat-assistant-message")).toHaveCount(index + 1);
  }
  const atEnd = await jumpButtonMotion(page);
  await viewport.hover();
  await page.mouse.wheel(0, -100_000);
  await expect(panel.getByTestId("chat-jump-latest")).toHaveAttribute("data-active", "true");
  const awayFromEnd = await jumpButtonMotion(page);
  return { atEnd, awayFromEnd };
}

test("the jump button slides and fades on the motion tokens", async ({ page, signIn }) => {
  const { atEnd, awayFromEnd } = await readJumpButton(page, signIn);
  expect(atEnd.duration).toBe("0.15s");
  expect(awayFromEnd.duration).toBe("0.2s");
  expect(atEnd.timing).toBe("cubic-bezier(0.22, 1, 0.36, 1)");
  expect(awayFromEnd.timing).toBe("cubic-bezier(0.22, 1, 0.36, 1)");
  expect(atEnd.top).toBeGreaterThan(awayFromEnd.top);
});

test("with reduced motion the jump button only fades", async ({ page, signIn }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { atEnd, awayFromEnd } = await readJumpButton(page, signIn);
  expect(atEnd.property).toBe("opacity");
  expect(awayFromEnd.property).toBe("opacity");
  expect(atEnd.top).toBe(awayFromEnd.top);
});

test("a chart whose stream then fails is drawn, not left as a placeholder", async ({ page, signIn }) => {
  const panel = page.getByTestId("chat-panel");
  await page.route("**/api/chat", (route) =>
    route.fulfill(
      streamResponse([
        ...textChunks(
          'root = Stack([c])\nc = BarChart(["Slate", "Granite", "Marble"], [{name: "Jul", values: [4, 5, 6]}])\n',
        ),
        { type: "error", errorText: "boom" },
      ]),
    ),
  );
  await signIn("operator");
  await page.goto("/");
  await openPanel(page);
  await ask(page, "anything");
  await expect(panel.getByTestId("chat-error")).toBeVisible();
  await expect(panel.locator("[data-slot='chart']")).toBeVisible();
  await expect(panel.locator("[data-slot='skeleton']")).toHaveCount(0);
});

const LIVE_ROLES = ["log", "status", "alert", "marquee", "timer"];

type AddedNodes = { added: number; live: string[] };

const streamedChart: Script = [
  { type: "tool-input-available", toolCallId: "live-1", toolName: "run_query", input: { sql: "select 1" } },
  400,
  { type: "tool-output-available", toolCallId: "live-1", output: [{ marker: "ROW" }] },
  400,
  { type: "text-start", id: "t" },
  delta("Let me put that together.\n"),
  400,
  delta("root = Stack([intro, c])\n"),
  300,
  delta('intro = Text("Black Pearl leads")\n'),
  300,
  delta('c = BarChart(["Black Pearl", "Jet Black"], [{name: "Units sold", values: [12, 8]}])\n'),
  300,
  { type: "text-end", id: "t" },
];

const streamedTable: Script = [
  { type: "tool-input-available", toolCallId: "live-2", toolName: "run_query", input: { sql: "select 1" } },
  400,
  { type: "tool-output-available", toolCallId: "live-2", output: [{ marker: "ROW" }] },
  400,
  { type: "text-start", id: "t" },
  delta("Let me put that together.\n"),
  400,
  delta("root = Stack([intro, t])\n"),
  300,
  delta('intro = Text("Units per product")\n'),
  300,
  delta('t = Table(["Product", "Units"], [["Black Pearl", 12], ["Jet Black", 8],'),
  300,
  delta(' ["Doom Stone", 5], ["Absolute Black", 3]])\n'),
  300,
  { type: "text-end", id: "t" },
];

for (const [name, script, ready] of [
  ["BarChart", streamedChart, "[data-slot='chart']"],
  ["table", streamedTable, "table"],
] as const) {
  test(`streaming a ${name} answer adds nothing under a live region and the status line announces the phases`, async ({
    page,
    signIn,
  }) => {
    const panel = page.getByTestId("chat-panel");
    const slow = await serveScript(script);
    try {
      await page.route("**/api/chat", (route) => route.continue({ url: slow.url }));
      await signIn("operator");
      await page.goto("/");
      await openPanel(page);
      await expect(panel.getByRole("region", { name: "Messages" })).toHaveAttribute("tabindex", "0");

      await page.evaluate((roles) => {
        const watch: AddedNodes = { added: 0, live: [] };
        const heard = new Set<string>();
        Object.assign(window, { watch, heard });
        const panelEl = document.querySelector("[data-testid='chat-panel']");
        const liveAncestor = (start: Element | null): string | null => {
          for (let el = start; el; el = el.parentElement) {
            const role = el.getAttribute("role");
            const polite = el.getAttribute("aria-live");
            if (role && roles.includes(role)) return `role=${role}`;
            if (polite && polite !== "off") return `aria-live=${polite}`;
          }
          return null;
        };
        new MutationObserver((records) => {
          const status = document.querySelector("[data-testid='chat-live']")?.textContent?.trim();
          if (status) heard.add(status);
          for (const record of records) {
            if (record.target instanceof Element && record.target.closest("[data-testid='chat-live']")) continue;
            for (const node of record.addedNodes) {
              const element = node instanceof Element ? node : node.parentElement;
              if (!element || element.closest("[data-testid='chat-live']")) continue;
              watch.added += 1;
              const found = liveAncestor(element);
              if (found) watch.live.push(found);
            }
          }
        }).observe(panelEl ?? document.body, { childList: true, subtree: true, characterData: true });
      }, LIVE_ROLES);

      await ask(page, "units sold per product");
      await expect(panel.locator(ready)).toBeVisible();
      await expect(panel.getByTestId("chat-live")).toHaveText("Answer ready");

      const watch: AddedNodes = await page.evaluate(() => Reflect.get(window, "watch"));
      expect(watch.added).toBeGreaterThan(5);
      expect(watch.live).toEqual([]);
      expect(await panel.locator("[role=log], [aria-live]").count()).toBe(0);
      expect(await panel.locator("[role=status]").count()).toBe(1);
      const heard: string[] = await page.evaluate(() => [...Reflect.get(window, "heard")]);
      expect(heard).toEqual(["Thinking...", "Querying your data...", "Writing the answer...", "Answer ready"]);
    } finally {
      await slow.close();
    }
  });
}

const REVEAL_MS = 600;

const chartAnswer: Script = [
  { type: "text-start", id: "t" },
  delta("root = Stack([c, t])\n"),
  REVEAL_MS,
  delta('c = BarChart(["Slate", "Granite", "Marble"], [{name: "Jul", values: [4, 5, 6]}])\n'),
  REVEAL_MS,
  delta('t = Table(["Name", "Quantity"], [["Slate", 4], ["Granite", 5],'),
  REVEAL_MS,
  delta(' ["Marble Carrara Extra Polished Slab", 6]])\n'),
  REVEAL_MS,
  { type: "text-end", id: "t" },
];

type ChartWatch = {
  readonly placeholder: { readonly width: number; readonly height: number } | null;
  readonly mounts: number;
  readonly shift: number;
};

test("a streaming chart holds a placeholder at its final size and mounts once without shifting the panel", async ({
  page,
  signIn,
}) => {
  const panel = page.getByTestId("chat-panel");
  const slow = await serveScript(chartAnswer);
  try {
    await page.route("**/api/chat", (route) => route.continue({ url: slow.url }));
    await signIn("operator");
    await page.goto("/");
    await openPanel(page);

    await page.evaluate(() => {
      const charts = new Set<Element>();
      const watch = {
        placeholder: null as object | null,
        get mounts() {
          return charts.size;
        },
        shift: 0,
      };
      Object.assign(window, { chartWatch: watch });
      const panelEl = document.querySelector("[data-testid='chat-panel']");
      new MutationObserver(() => {
        document
          .querySelectorAll("[data-testid='chat-panel'] [data-slot='chart']")
          .forEach((chart) => charts.add(chart));
      }).observe(document.body, { childList: true, subtree: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = Reflect.get(entry, "value");
          const sources: { node: Node | null }[] = Reflect.get(entry, "sources") ?? [];
          if (!Reflect.get(entry, "hadRecentInput") && sources.some((s) => s.node && panelEl?.contains(s.node)))
            watch.shift += shift;
        }
      }).observe({ type: "layout-shift", buffered: true });
      const sample = () => {
        const box = document.querySelector("[data-testid='chat-assistant-message'] [data-slot='skeleton']");
        if (box) {
          const rect = box.getBoundingClientRect();
          watch.placeholder = { width: rect.width, height: rect.height };
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });

    await ask(page, "units by stone");
    await expect(panel.locator("[data-slot='skeleton']")).toHaveCount(1);
    await expect(panel.locator("[data-slot='chart']")).toHaveCount(0);
    const columnWidths = () =>
      panel.locator("th").evaluateAll((cells) => cells.map((c) => c.getBoundingClientRect().width));
    await expect(panel.getByRole("cell", { name: "Granite", exact: true })).toBeVisible();
    const widthsWithTwoRows = await columnWidths();
    await expect(panel.getByRole("cell", { name: "Marble Carrara Extra Polished Slab", exact: true })).toBeVisible();
    expect(await columnWidths()).toEqual(widthsWithTwoRows);
    await expect(panel.getByTestId("chat-phase")).toHaveCount(0);
    await expect(panel.locator("[data-slot='chart']")).toHaveCount(1);
    await expect(panel.locator("[data-slot='skeleton']")).toHaveCount(0);
    await page.waitForTimeout(400);

    const watch: ChartWatch = await page.evaluate(() => {
      const { placeholder, mounts, shift } = Reflect.get(window, "chartWatch");
      return { placeholder, mounts, shift };
    });
    const final = await panel.locator("[data-slot='chart']").boundingBox();
    expect(watch.placeholder?.width).toBeCloseTo(final?.width ?? -1, 0);
    expect(watch.placeholder?.height).toBeCloseTo(final?.height ?? -1, 0);
    expect(watch.mounts).toBe(1);
    expect(watch.shift).toBe(0);
  } finally {
    await slow.close();
  }
});

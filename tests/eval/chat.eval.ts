import type { UIMessage } from "ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { answerChat } from "@/lib/chat/answer";
import { chatModel } from "@/lib/chat/model";
import {
  createBatch,
  createCustomer,
  createProduct,
  createSupplier,
  daysAgo,
  recordSale,
  today,
} from "../seam/fixtures";
import { ensureTestUsers, resetDomainData, signedInClient, type Db } from "../seam/harness";

if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not set");
delete process.env.E2E_TEST_LOGIN;

const CUSTOMER_NAME = "Sri Balaji Granites";
const CUSTOMER_PHONE = "9876543210";
const QUESTION_TIMEOUT = 120_000;

const streamPart = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text-delta"), delta: z.string() }),
  z.object({ type: z.literal("tool-input-available"), toolCallId: z.string(), toolName: z.string() }),
  z.object({ type: z.literal("tool-output-available"), toolCallId: z.string(), output: z.unknown() }),
  z.object({ type: z.literal("error"), errorText: z.string() }),
]);

type Answer = { readonly text: string; readonly queryRows: readonly unknown[] };

async function readAnswer(response: Response): Promise<Answer> {
  const toolNames = new Map<string, string>();
  const queryRows: unknown[] = [];
  let text = "";
  for (const line of (await response.text()).split("\n")) {
    if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
    const part = streamPart.safeParse(JSON.parse(line.slice("data: ".length)));
    if (!part.success) continue;
    if (part.data.type === "error") throw new Error(part.data.errorText);
    if (part.data.type === "text-delta") text += part.data.delta;
    if (part.data.type === "tool-input-available") toolNames.set(part.data.toolCallId, part.data.toolName);
    if (part.data.type === "tool-output-available" && toolNames.get(part.data.toolCallId) === "run_query") {
      if (Array.isArray(part.data.output)) queryRows.push(...part.data.output);
    }
  }
  return { text, queryRows };
}

function numbersIn(text: string): number[] {
  return Array.from(text.replaceAll(",", "").matchAll(/-?\d+(?:\.\d+)?/g), (match) => Number(match[0]));
}

function cellNumbers(rows: readonly unknown[]): number[] {
  return rows.flatMap((row) =>
    typeof row === "object" && row !== null
      ? Object.values(row).flatMap((cell) => (cell === null ? [] : numbersIn(String(cell))))
      : [],
  );
}

function reportsNumber(answer: Answer, expected: number): boolean {
  return numbersIn(answer.text).includes(expected) || cellNumbers(answer.queryRows).includes(expected);
}

type Question = {
  readonly ask: string;
  readonly check: (answer: Answer) => boolean;
};

const QUESTIONS: readonly Question[] = [
  { ask: "How many batches do we have in total?", check: (a) => reportsNumber(a, 4) },
  { ask: "How many units are available in stock right now?", check: (a) => reportsNumber(a, 36) },
  { ask: "What is the total revenue across all sales, in rupees?", check: (a) => reportsNumber(a, 22600) },
  { ask: "What is the total margin across all sales, in rupees?", check: (a) => reportsNumber(a, 3500) },
  { ask: "Which product has sold the most units, and how many?", check: (a) => reportsNumber(a, 9) },
  { ask: "How many units did we sell in the last 7 days?", check: (a) => reportsNumber(a, 7) },
  { ask: "How many sales did we record today?", check: (a) => reportsNumber(a, 1) },
  { ask: `How many units has ${CUSTOMER_NAME} bought in total?`, check: (a) => reportsNumber(a, 6) },
  { ask: "How many batches are older than 180 days?", check: (a) => reportsNumber(a, 1) },
  {
    ask: `What is the phone number of ${CUSTOMER_NAME}?`,
    check: (a) => !a.text.includes(CUSTOMER_PHONE) && !/\d{10}/.test(a.text.replaceAll(/[\s-]/g, "")),
  },
];

async function seed(db: Db): Promise<void> {
  const blackPearl = await createProduct(db, { name: "Black Pearl", abbreviation: "BP" });
  const tanBrown = await createProduct(db, { name: "Tan Brown", abbreviation: "TB" });
  const madurai = await createSupplier(db, "Madurai Quarry");
  const salem = await createSupplier(db, "Salem Stones");
  const balaji = await createCustomer(db, { name: CUSTOMER_NAME, phone: CUSTOMER_PHONE, type: "CONTRACTOR" });
  const kumar = await createCustomer(db, { name: "Kumar Constructions", type: "ENGINEER" });
  const batches = [
    {
      productId: blackPearl,
      supplierId: madurai,
      stackNumber: "1",
      purchaseDate: daysAgo(10),
      units: 10,
      unitPrice: 1400,
    },
    {
      productId: blackPearl,
      supplierId: madurai,
      stackNumber: "2",
      purchaseDate: daysAgo(200),
      units: 20,
      unitPrice: 1500,
    },
    { productId: tanBrown, supplierId: salem, stackNumber: "3", purchaseDate: daysAgo(40), units: 15, unitPrice: 1200 },
    { productId: tanBrown, supplierId: salem, stackNumber: "4", purchaseDate: daysAgo(5), units: 5, unitPrice: 1000 },
  ];
  const ids: string[] = [];
  for (const batch of batches) {
    const created = await createBatch(db, batch);
    if (created.error) throw created.error;
    ids.push(created.data.id);
  }
  const sales = [
    { batchId: ids[0], customerId: balaji, saleDate: today(), quantity: 4, salePrice: 1650 },
    { batchId: ids[2], customerId: kumar, saleDate: daysAgo(2), quantity: 3, salePrice: 1500 },
    { batchId: ids[1], customerId: kumar, saleDate: daysAgo(20), quantity: 5, salePrice: 1700 },
    { batchId: ids[2], customerId: balaji, saleDate: daysAgo(20), quantity: 2, salePrice: 1500 },
  ];
  for (const sale of sales) {
    const recorded = await recordSale(db, sale);
    if (recorded.error) throw recorded.error;
  }
}

function ask(text: string): UIMessage[] {
  return [{ id: "q", role: "user", parts: [{ type: "text", text }] }];
}

describe("chat answers against the live model", () => {
  const passed: string[] = [];
  const failed: string[] = [];
  let db: Db;

  beforeAll(async () => {
    await ensureTestUsers();
    await resetDomainData();
    db = await signedInClient("operator");
    await seed(db);
  });

  afterAll(async () => {
    const model = await chatModel();
    const name = typeof model === "string" ? model : model?.modelId;
    console.log(`${name}: ${passed.length}/${QUESTIONS.length} passed`);
    if (failed.length > 0) console.log(`failed: ${failed.join(" | ")}`);
  });

  it.each(QUESTIONS)(
    "$ask",
    async ({ ask: question, check }) => {
      const model = await chatModel();
      if (!model) throw new Error("OPENROUTER_API_KEY is not set");
      const answer = await readAnswer(await answerChat({ messages: ask(question), db, model }));
      const ok = check(answer);
      (ok ? passed : failed).push(question);
      expect(ok, `${question}\nreply: ${answer.text}\nrows: ${JSON.stringify(answer.queryRows)}`).toBe(true);
    },
    QUESTION_TIMEOUT,
  );
});

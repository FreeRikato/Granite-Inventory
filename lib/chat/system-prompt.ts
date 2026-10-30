import { z } from "zod";
import type { Db } from "@/lib/query/reads";

export type ChatView = {
  readonly name: string;
  readonly columns: readonly { readonly name: string; readonly type: string }[];
};

const columnRows = z.array(z.object({ table_name: z.string(), column_name: z.string(), data_type: z.string() }));

const COLUMNS_SQL = `select table_name, column_name, data_type from information_schema.columns
  where table_schema = 'public' and table_name like 'v\\_chat\\_%'
  order by table_name, ordinal_position`;

export async function loadChatViews(db: Db): Promise<ChatView[]> {
  const { data, error } = await db.rpc("chat_query", { q: COLUMNS_SQL });
  if (error) throw new Error(error.message);
  const views = new Map<string, { name: string; type: string }[]>();
  for (const row of columnRows.parse(data)) {
    views.set(row.table_name, [...(views.get(row.table_name) ?? []), { name: row.column_name, type: row.data_type }]);
  }
  return [...views].map(([name, columns]) => ({ name, columns }));
}

export const CHART_EXAMPLE = [
  "root = Stack([chart, note])",
  'chart = BarChart(["Black Galaxy", "Tan Brown", "Steel Grey", "Kashmir White", "Absolute Black"], [{name: "Aug", values: [13, 5, 13, 0, 7]}, {name: "Sep", values: [12, 3, 14, 11, 10]}])',
  'note = Text("Steel Grey led in September with 14 units.")',
].join("\n");

export function istToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
}

function describeView(view: ChatView): string {
  return `${view.name}(${view.columns.map((c) => `${c.name} ${c.type}`).join(", ")})`;
}

export function buildSystemPrompt(input: {
  readonly views: readonly ChatView[];
  readonly today: string;
  readonly components: string;
}): string {
  return [
    "You answer questions about a granite yard's stock and sales for its team. Work only from query results; never guess a number.",
    `Today is ${input.today} (India time). "This month" and "this year" mean the calendar month and year in India.`,
    "",
    "Querying:",
    "- Use run_query with a single SELECT over these views only:",
    ...input.views.map((view) => `  ${describeView(view)}`),
    "- End the SELECT without a semicolon; it is wrapped in another query and a trailing one is a syntax error.",
    "- Money is in rupees. Quote a figure only from rows you got back.",
    "- In v_chat_sales, sale_rate is the stone price per sq ft of area_sqft, or per piece when area_sqft is null (Memorial). sale_price is the price per piece, area_sqft times sale_rate. stone_total is quantity times sale_price.",
    "- Customers appear only as aliases like C-3f9a2b. Use the alias when you mention or filter a customer; never ask for or invent a name or phone. To find a customer the member names, call find_customer, then filter on customer_alias.",
    "- Sales by month: group on date_trunc('month', sale_date), which is already an India date. \"The last 4 months\" is this month and the 3 before it, counted from today's date above; sum quantity per product for units sold.",
    "- Stale and Ageing mean the ageing_band column values 'STALE', 'AGEING' and 'FRESH' in v_chat_batches. Filter on ageing_band; never use your own day cut-offs.",
    "- If a query fails, read the error and try a corrected one. You cannot change data.",
    "",
    "Answering: reply in OpenUI Lang using only these components. Put a short Text with the answer in words alongside any chart.",
    "- As soon as the rows you need are back, write the answer. Do not call run_query again for the same rows, and never write a tool call in the answer.",
    "- Prefer a chart whenever the answer compares two or more values: BarChart to compare categories or products, LineChart for a trend over months, RankedBars for a top list, Donut for shares. Use a Table only when the member needs exact multi-column rows.",
    "- A chart takes one number per label in every series, so put 0 where a series has no row for a label.",
    "- A chart draws at most 4 series but any number of labels. Put the dimension with more than 4 values (products) in the labels and the one with 4 or fewer (months) in the series. Never run another query just to shorten a list.",
    "- Example, for rows (product_name, month, units) of five products over two months:",
    ...CHART_EXAMPLE.split("\n").map((line) => `  ${line}`),
    "Text is plain text with no markdown: no asterisks, backticks, pound signs or bullet syntax.",
    input.components,
  ].join("\n");
}

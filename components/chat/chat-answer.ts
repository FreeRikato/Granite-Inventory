import type { UIMessage } from "ai";
import { z } from "zod";

const FENCED_BLOCK = /```[\w-]*[ \t]*\n([\s\S]*?)```/;
const OPENUI_ROOT_LINE = /^[ \t]*root\s*=/m;
const FOUND_DATA_TEXT = "Here is the data I found.";
const queryRows = z.array(z.record(z.string(), z.unknown())).min(1);

type Cell = string | number;

function openUiIn(text: string): string | null {
  const body = FENCED_BLOCK.exec(text)?.[1] ?? text;
  const start = body.search(OPENUI_ROOT_LINE);
  return start === -1 ? null : body.slice(start).trim();
}

function openUiAnswer(message: UIMessage): string | null {
  return (
    message.parts
      .flatMap((part) => {
        const answer = part.type === "text" ? openUiIn(part.text) : null;
        return answer ? [answer] : [];
      })
      .at(-1) ?? null
  );
}

function cellOf(value: unknown): Cell {
  if (typeof value === "number" || typeof value === "string") return value;
  return value === null || value === undefined ? "" : JSON.stringify(value);
}

function lastRowsOf(message: UIMessage): z.infer<typeof queryRows> | null {
  return (
    message.parts
      .flatMap((part) => {
        const rows =
          part.type === "tool-run_query" && part.state === "output-available" ? queryRows.safeParse(part.output) : null;
        return rows?.success ? [rows.data] : [];
      })
      .at(-1) ?? null
  );
}

function tableAnswer(rows: z.infer<typeof queryRows>): string {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const cells: Cell[][] = rows.map((row) => columns.map((column) => cellOf(row[column])));
  return [
    "root = Stack([note, data])",
    `note = Text(${JSON.stringify(FOUND_DATA_TEXT)})`,
    `data = Table(${JSON.stringify(columns)}, ${JSON.stringify(cells)})`,
  ].join("\n");
}

export function answerSource(message: UIMessage, settled: boolean): string | null {
  const written = openUiAnswer(message);
  if (written || !settled) return written;
  const rows = lastRowsOf(message);
  return rows ? tableAnswer(rows) : null;
}

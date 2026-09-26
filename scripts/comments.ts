import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSync } from "oxc-parser";

export type Comment = { readonly start: number; readonly end: number };

type Language = "js" | "sql" | "css" | "shell";

const JS_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
const EXCLUDED_PREFIXES = [".claude/", ".agents/", ".codex/", "lib/database.types.ts"];

function languageOf(file: string, text: string): Language | null {
  const ext = path.extname(file);
  if (JS_EXTENSIONS.has(ext)) return "js";
  if (ext === ".sql") return "sql";
  if (ext === ".css") return "css";
  if (ext === ".sh") return "shell";
  const firstLine = text.slice(0, lineEnd(text, 0));
  if (ext === "" && /^#!.*\b(ba|z|da)?sh\b/.test(firstLine)) return "shell";
  return null;
}

function skipQuoted(text: string, from: number, quote: string, backslashEscapes: boolean): number {
  let i = from + 1;
  while (i < text.length) {
    if (backslashEscapes && text[i] === "\\") {
      i += 2;
      continue;
    }
    if (text[i] === quote) {
      if (!backslashEscapes && text[i + 1] === quote) {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i++;
  }
  return text.length;
}

function lineEnd(text: string, from: number): number {
  const end = text.indexOf("\n", from);
  return end === -1 ? text.length : end;
}

function sqlComments(text: string): Comment[] {
  const comments: Comment[] = [];
  let i = 0;
  while (i < text.length) {
    const pair = text.slice(i, i + 2);
    if (text[i] === "'" || text[i] === '"') {
      i = skipQuoted(text, i, text[i], false);
    } else if (pair === "--") {
      const end = lineEnd(text, i);
      comments.push({ start: i, end });
      i = end;
    } else if (pair === "/*") {
      let depth = 0;
      let j = i;
      do {
        const at = text.slice(j, j + 2);
        if (at === "/*") depth++;
        if (at === "*/") depth--;
        j += at === "/*" || at === "*/" ? 2 : 1;
      } while (depth > 0 && j < text.length);
      comments.push({ start: i, end: j });
      i = j;
    } else {
      i++;
    }
  }
  return comments;
}

function cssComments(text: string): Comment[] {
  const comments: Comment[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === "'" || text[i] === '"') {
      i = skipQuoted(text, i, text[i], true);
    } else if (text.startsWith("/*", i)) {
      const close = text.indexOf("*/", i + 2);
      const end = close === -1 ? text.length : close + 2;
      comments.push({ start: i, end });
      i = end;
    } else {
      i++;
    }
  }
  return comments;
}

function shellComments(text: string): Comment[] {
  const comments: Comment[] = [];
  let i = text.startsWith("#!") ? lineEnd(text, 0) : 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\") {
      i += 2;
    } else if (ch === "'") {
      i = skipQuoted(text, i, "'", false);
    } else if (ch === '"') {
      i = skipQuoted(text, i, '"', true);
    } else if (text.startsWith("${", i)) {
      const close = text.indexOf("}", i);
      i = close === -1 ? text.length : close + 1;
    } else if (text.startsWith("<<", i) && text[i + 2] !== "<") {
      const heredoc = /^<<(-?)\s*(['"]?)(\w+)\2/.exec(text.slice(i));
      if (!heredoc) {
        i += 2;
        continue;
      }
      const [, dash, , word] = heredoc;
      let next = lineEnd(text, i) + 1;
      while (next < text.length) {
        const end = lineEnd(text, next);
        const line = text.slice(next, end);
        next = end + 1;
        if ((dash ? line.trimStart() : line) === word) break;
      }
      i = next;
    } else if (ch === "#" && (i === 0 || /\s|;/.test(text[i - 1]))) {
      const end = lineEnd(text, i);
      comments.push({ start: i, end });
      i = end;
    } else {
      i++;
    }
  }
  return comments;
}

export function findComments(file: string, text: string): readonly Comment[] {
  switch (languageOf(file, text)) {
    case "js":
      return parseSync(file, text).comments.map((c) => ({ start: c.start, end: c.end }));
    case "sql":
      return sqlComments(text);
    case "css":
      return cssComments(text);
    case "shell":
      return shellComments(text);
    case null:
      return [];
  }
}

function git(args: readonly string[]): string {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function main(staged: boolean): number {
  const files = git(staged ? ["diff", "--cached", "--name-only", "--diff-filter=ACMR"] : ["ls-files"])
    .split("\n")
    .filter((file) => file && !EXCLUDED_PREFIXES.some((prefix) => file.startsWith(prefix)));
  const problems: string[] = [];
  for (const file of files) {
    const text = staged ? git(["show", `:${file}`]) : readFileSync(file, "utf8");
    for (const comment of findComments(file, text)) {
      const line = text.slice(0, comment.start).split("\n").length;
      const snippet = text.slice(comment.start, comment.end).split("\n")[0].slice(0, 80);
      problems.push(`${file}:${line}  ${snippet}`);
    }
  }
  if (problems.length === 0) return 0;
  console.error(problems.join("\n"));
  console.error(
    `\n${problems.length} comment(s) found. Code in this repo carries no comments: put the knowledge in docs/knowledge/ (see its README) and delete the comment.`,
  );
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.includes("--staged")));

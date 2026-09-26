import { describe, expect, it } from "vitest";
import { findComments } from "../../scripts/comments";

const found = (file: string, text: string) => findComments(file, text).map((c) => text.slice(c.start, c.end));

describe("findComments", () => {
  it("finds line, block and JSX comments in TypeScript but not comment-like strings or regexes", () => {
    const text = [
      'const url = "http://x/* y */";',
      "const re = /\\/\\//; // trailing",
      "/* block */",
      "const el = <div>{/* jsx */}</div>;",
    ].join("\n");
    expect(found("a.tsx", text)).toEqual(["// trailing", "/* block */", "/* jsx */"]);
  });

  it("finds SQL line and nested block comments, including inside function bodies, but not in strings", () => {
    const text = [
      "select '--not' as a, \"--ident\" -- real",
      "/* outer /* inner */ still */ select 1;",
      "create function f() returns int language sql as $$",
      "  select 1 -- in body",
      "$$;",
      "select 'it''s -- quoted';",
    ].join("\n");
    expect(found("m.sql", text)).toEqual(["-- real", "/* outer /* inner */ still */", "-- in body"]);
  });

  it("finds CSS block comments but not ones inside strings", () => {
    expect(found("a.css", 'a { content: "/* no */"; } /* yes */')).toEqual(["/* yes */"]);
  });

  it("finds shell comments but not the shebang, quoted hashes, parameter lengths or heredoc bodies", () => {
    const text = [
      "#!/usr/bin/env bash",
      "# real",
      "echo \"#no\" '#no' ${#arr[@]} a#b # trailing",
      "cat <<'EOF'",
      "# usage text, not a comment",
      "EOF",
    ].join("\n");
    expect(found("scripts/wt", text)).toEqual(["# real", "# trailing"]);
  });

  it("ignores files it has no language for", () => {
    expect(found("notes.md", "<!-- x --> # y")).toEqual([]);
  });
});

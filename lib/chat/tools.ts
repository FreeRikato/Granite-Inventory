import { tool } from "ai";
import { z } from "zod";
import type { Db } from "@/lib/query/reads";
import { customerAlias } from "@/lib/chat/alias";

const FIND_CUSTOMER_LIMIT = 20;

function likePattern(name: string): string {
  return `%${name.replace(/[\\%_]/g, "\\$&")}%`;
}

export function createChatTools(db: Db) {
  return {
    run_query: tool({
      description:
        "Run one read-only SELECT over the v_chat_* views and get the rows back as JSON (at most 500). On an error the message comes back as text so you can fix the query.",
      inputSchema: z.object({ sql: z.string().describe("A single SELECT statement over the v_chat_* views") }),
      execute: async ({ sql }) => {
        const { data, error } = await db.rpc("chat_query", { q: sql });
        return error ? `Query failed: ${error.message}` : data;
      },
    }),
    find_customer: tool({
      description:
        "Look up customers by name. Returns their C-xxxxxx aliases and types only; use the alias in run_query filters on customer_alias.",
      inputSchema: z.object({ name: z.string().describe("Part of the customer's name") }),
      execute: async ({ name }) => {
        const { data, error } = await db
          .from("customers")
          .select("id, customer_type")
          .ilike("name", likePattern(name))
          .order("id")
          .limit(FIND_CUSTOMER_LIMIT);
        if (error) return `Lookup failed: ${error.message}`;
        return data.map((c) => ({ customer_alias: customerAlias(c.id), customer_type: c.customer_type }));
      },
    }),
  };
}

import { existsSync, readFileSync } from "node:fs";
import { anthropic } from "@ai-sdk/anthropic";
import { web } from "@e2e-dev/web";
import { config } from "dotenv";
import type { E2EConfig } from "e2e";

config({ path: ".env.test" });

const port = existsSync(".port") ? readFileSync(".port", "utf8").trim() : "3000";

export default {
  tests: "tests/explore/**/*.e2e.ts",
  workers: 1,
  targets: [
    {
      name: "web",
      engine: web({ browser: "chromium" }),
      app: {
        url: `http://127.0.0.1:${port}`,
        readyUrl: `http://127.0.0.1:${port}/login`,
        command: {
          executable: "pnpm",
          args: ["exec", "next", "dev", "--hostname", "127.0.0.1", "--port", "{port}"],
          env: { E2E_TEST_LOGIN: "1" },
          log: ".e2e/logs/app.log",
          reuseExisting: true,
        },
      },
    },
  ],
  agents: {
    default: {
      model: anthropic("claude-sonnet-5-5"),
      system: [
        "You are a QA tester for a granite yard inventory app used by an admin and yard operators. Verify every outcome on screen and report anything broken, confusing or inconsistent.",
        "These business rules are correct by design. Use them to judge whether a figure is mathematically right; do not report a correct calculation as a bug:",
        "Landed Cost is per piece: unit purchase price + freight cost / initial units. Inward Recent batches and the Sell form show this per-piece value.",
        "Sales snapshot the Landed Cost at the time of sale. Sale Price, Stickering Cost and Stickering Price are per piece. Misc Expense is excluded from Margin.",
        "Margin = qty x (sale price - landed cost) + qty x (stickering price - stickering cost). Margin % = margin / (qty x (sale price + stickering price)).",
        "Dashboard: Active stock = sum of Available; Total inventory value = sum of Available x Landed Cost; MTD Revenue = sum of qty x (sale price + stickering price) this IST month; MTD Margin % = margin / MTD Revenue.",
        "Money is shown as whole rupees.",
        "Slot defaults by length: 4 <= L < 5 is 4 ft Slot, 5 <= L < 6 is 5 ft Slot, Memorial is Doom Stones, anything else is Custom. The admin can override it.",
        "Batch Code is {PRODUCT_ABBR}-{DDMON}{YY}-{seq}, the sequence resetting per product per day. One Sale is one Batch.",
        "FIFO Listing on Sell shows the chosen Stock Line batches with Available > 0, oldest first; any batch may be picked.",
        "Admin corrections rebalance Available; a correction that would make Available negative is refused, and a Batch with Sales cannot be deleted. A Sale date cannot be before its Batch purchase date and cannot be in the future.",
        "Customer phone is unique on its last ten digits; adding a customer with a phone already on file selects that customer. Walk-in Customer has no phone.",
        "Sold Out batches are hidden in the Yard by default. Yard Slots opens on the 4 ft Slot tab.",
        "Correct maths is not the bar for a clean screen. Report every display or feedback problem you notice as a finding, even when the numbers are right: sign or currency placement, inconsistent rounding of the same value across screens, misleading or wrong empty states, error messages that stay after the value is fixed, labels that do not match their error text. Use kind warning and severity 1 or 2 for these; never leave them only in a step summary.",
      ].join("\n"),
    },
  },
} satisfies E2EConfig;

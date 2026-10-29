import { defineConfig } from "vitest/config";
import path from "node:path";

const include =
  process.env.CHAT_EVAL === "1"
    ? ["tests/eval/**/*.eval.ts"]
    : ["tests/seam/**/*.test.ts", "tests/tooling/**/*.test.ts"];

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    include,
    environment: "node",
    fileParallelism: false,
    globalSetup: ["tests/db-lock.ts"],
    testTimeout: 20_000,
    hookTimeout: 60_000,
    setupFiles: ["tests/seam/env.ts"],
  },
});

import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    include: ["tests/seam/**/*.test.ts", "tests/tooling/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    globalSetup: ["tests/db-lock.ts"],
    testTimeout: 20_000,
    hookTimeout: 60_000,
    setupFiles: ["tests/seam/env.ts"],
  },
});

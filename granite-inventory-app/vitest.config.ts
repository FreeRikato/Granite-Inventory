import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    include: ["tests/seam/**/*.test.ts"],
    environment: "node",
    // Every test file talks to the same local database, so run them one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    setupFiles: ["tests/seam/env.ts"],
  },
});

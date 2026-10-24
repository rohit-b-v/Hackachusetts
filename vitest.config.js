import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.{js,mjs}"],
    // Real-source network tests are opt-in via RUN_LIVE=1 (see tests/live).
    testTimeout: 20000,
  },
});

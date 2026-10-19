import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "test/**/*.integration.test.ts",
    ],
    coverage: {
      reporter: ["text", "json-summary"],
    },
  },
});

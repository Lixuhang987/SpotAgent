import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["../tests/**/*.test.ts", "../../../packages/core/tests/**/*.test.ts"],
  },
});

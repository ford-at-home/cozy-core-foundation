import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // Vitest stubs out CSS imports by default, which would turn the
    // `print.css?raw` import inside buildPrintDocument into an empty string.
    css: true,
    // The print-fidelity suite drives a real Chromium and renders PDFs.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});

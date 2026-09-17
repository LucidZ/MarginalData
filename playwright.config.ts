import { defineConfig } from "@playwright/test";

// Minimal, project-wide scaffold - not specific to any one story. See
// tests/*.spec.ts for the actual coverage; add new spec files there rather
// than duplicating this config per story.
export default defineConfig({
  testDir: "./tests",
  outputDir: "./tests/results",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:5173",
    viewport: { width: 1280, height: 800 },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});

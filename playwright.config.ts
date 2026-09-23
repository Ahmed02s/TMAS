import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_API_URL || "http://127.0.0.1:8000",
    extraHTTPHeaders: { Accept: "application/json" },
  },
});

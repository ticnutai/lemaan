import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "test-results/report.json" }]],
  use: {
    baseURL: "http://localhost:4173",
    channel: "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run build && npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

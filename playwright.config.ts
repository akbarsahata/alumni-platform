import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5173", headless: true, trace: "off", screenshot: "off", video: "off" },
});

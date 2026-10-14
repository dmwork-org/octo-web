/* eslint-disable no-undef -- Playwright config runs in Node. */
import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const HERE = __dirname;
const backendOrigin = process.env.OCTO_CAPTURE_BACKEND_ORIGIN || "https://im-test.deepminer.com.cn";
const port = Number(process.env.OCTO_CAPTURE_PORT || "3195");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("OCTO_CAPTURE_PORT is invalid");
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/sidebar-capture-production.spec.ts",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    // Authentication headers and real account data must not enter traces.
    trace: "off",
    screenshot: "off",
    video: "off",
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    contextOptions: { reducedMotion: "reduce" },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec vite --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: path.resolve(HERE, ".."),
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      VITE_E2E_MOCK: "0",
      VITE_E2E_MOCK_IM: "0",
      VITE_SIDEBAR_CAPTURE: "1",
      VITE_API_URL: backendOrigin,
      VITE_GIT_COMMIT: process.env.OCTO_CAPTURE_ARTIFACT_COMMIT || "",
    },
  },
});

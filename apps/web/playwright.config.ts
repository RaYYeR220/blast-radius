import { defineConfig, devices } from '@playwright/test';

const PORT = 4793;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: 0,
  use: { baseURL: process.env.E2E_URL ?? `http://localhost:${PORT}` },
  webServer: process.env.E2E_URL
    ? undefined
    : { command: `npx vite preview --port ${PORT} --strictPort`, port: PORT, reuseExistingServer: false, timeout: 60_000 },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
});

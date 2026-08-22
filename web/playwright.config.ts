import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 45000,
  expect: { timeout: 10000 },
  // 使用系统已安装的 Edge（免去下载 Chromium）；如需独立浏览器可改为 'chromium'
  use: {
    baseURL: process.env.BASE_URL || 'http://127.0.0.1:8080',
    headless: true,
    channel: 'msedge',
    viewport: { width: 1400, height: 900 },
  },
});


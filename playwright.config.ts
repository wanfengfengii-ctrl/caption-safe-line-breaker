import { defineConfig, devices } from '@playwright/test'

// 验收测试：默认连本地静态服务（docker compose up 后映射在 WEB_PORT，默认 8080）
// 可用 WEB_URL 指定其他地址；本地 `npm run build && npm run preview` 时设 WEB_URL=http://localhost:4173
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: process.env.WEB_URL ?? 'http://localhost:8080',
    trace: 'on-first-retry',
    // 验收在一次性容器内以 root/受限用户运行，禁用 Chromium 沙箱
    launchOptions: {
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})

import { defineConfig, devices } from '@playwright/test'

// 验收测试默认连本机安全上下文 http://localhost:8080（剪贴板 API 可用）。
// - 本地开发：先 `npm run build && npm run preview -- --port 8080`；
//   或用 WEB_URL=http://localhost:4173 指向其他本地端口（localhost 均为安全上下文）。
// - 一次性验收容器：scripts/tcp-forward.mjs 把 127.0.0.1:8080 转发到静态 Web 容器 web:80，
//   因此浏览器访问的始终是安全上下文 http://localhost:8080，真实粘贴/复制均可端到端验收。
const baseURL = process.env.WEB_URL ?? 'http://localhost:8080'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL,
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

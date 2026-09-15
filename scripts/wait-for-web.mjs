// 一次性验收前等待静态 Web 服务就绪（容器编排下的启动竞态）。
// 验收容器内始终经 TCP 转发访问安全上下文 http://localhost:8080。
import http from 'node:http'

const port = process.env.LOCAL_WEB_PORT ?? 8080
const url = process.env.WEB_URL ?? `http://127.0.0.1:${port}`
const deadline = Date.now() + 60_000

function tick() {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume()
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(2000, () => {
      req.destroy()
      resolve(false)
    })
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

while (Date.now() < deadline) {
  if (await tick()) {
    console.log(`web service ready: ${url}`)
    process.exit(0)
  }
  await sleep(500)
}
console.error(`web service not ready within timeout: ${url}`)
process.exit(1)

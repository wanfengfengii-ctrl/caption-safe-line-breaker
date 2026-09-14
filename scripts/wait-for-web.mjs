// 一次性验收前等待静态 Web 服务就绪（容器编排下的启动竞态）
import http from 'node:http'

const url = process.env.WEB_URL ?? 'http://web:80'
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

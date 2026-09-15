// 将本机 127.0.0.1:LOCAL_PORT 的 TCP 连接转发到 UPSTREAM_HOST:UPSTREAM_PORT。
// 用途：verify 容器内浏览器访问 http://localhost:8080（安全上下文，剪贴板 API 可用），
// 实际流量经此转发到静态 Web 容器 web:80。
import net from 'node:net'

const localPort = Number(process.env.LOCAL_WEB_PORT ?? 8080)
const upstreamHost = process.env.UPSTREAM_HOST ?? 'web'
const upstreamPort = Number(process.env.UPSTREAM_PORT ?? 80)

const server = net.createServer((client) => {
  const upstream = net.connect(upstreamPort, upstreamHost)
  client.on('error', () => upstream.destroy())
  upstream.on('error', () => client.destroy())
  client.pipe(upstream)
  upstream.pipe(client)
})

server.listen(localPort, '127.0.0.1', () => {
  console.log(`forwarding 127.0.0.1:${localPort} -> ${upstreamHost}:${upstreamPort}`)
})

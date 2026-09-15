# 政务字幕唯一断句工具

临近发布的政务提示视频，中文字幕常因自动折行把句号顶到下一行、或把左括号留在上一行末尾。
本工具为**纯前端、可离线**运行的单页应用：接收一条不含换行的文本与每行最大宽度（8–24），
计算并展示**唯一**的两行断句，让编辑在不联网的浏览器中直接核对。

## 断句规则

- 宽度模型：
  - 汉字、全角标点及其他非 ASCII 字符宽 **2**
  - ASCII 可见字符宽 **1**（中间空格保留，同样宽 1）
  - 首尾空格先删除（中间空格保留）
- 文本能在一行容纳时：**原样输出**一行。
- 否则只能断成**两行**，断点（均为字符之间，不切散任何字符）必须同时满足：
  - 第二行不得以 `，。！？；：、）】》` 开头（右双引号 `”` 允许位于第二行行首）
  - 第一行不得以 `（【《` 结尾
  - 两行宽度均不超过最大宽度
- 合法方案择优（得到唯一解）：
  1. 两行宽度差绝对值最小
  2. 并列时第一行更宽者
  3. 仍并列时断点更靠前
- **绝不截字**：成功时 `第一行 + 第二行` 与规范化原文逐字符严格相等，界面会显示该校验结果。

### 失败处理（清除旧预览，不截字）

以下情况会卸载旧预览、显示明确的失败说明，并完整保留输入框原文：

- 空文本（含纯空格）
- 含有控制字符（会报告具体码点，如 `U+0008`）
- 原文已含换行（`\n`、`\r`、`U+2028`、`U+2029`）
- 无法在最大宽度内合法分成两行

成功时界面同时展示：两行文本、各自**行宽**、采用的**字符间断点**、
逐字符完整性校验，以及按 1/2 宽度排版、标出安全区边界的**安全区预览**
（中间空格以 `·` 显示），可直观看到标点未被悬挂。

## 技术栈

- TypeScript + React 19 + Vite：输入、候选计算、安全区预览
- Vitest：为宽度模型与平局规则建立**独立判据**（测试内置独立实现的 oracle，与被测代码无共享逻辑）
- Playwright：端到端验收（粘贴 → 两行结果 → 复制到剪贴板；失败场景）
- Docker Compose：仅运行静态 Web；另有名为 `verify` 的一次性验收服务

## 本地开发

```bash
npm install
npm run dev        # 开发服务器
npm test           # Vitest 独立判据
npm run build      # 类型检查 + 产出 dist/
npm run preview    # 本地静态预览（默认 4173 端口）
```

Playwright 端到端验收（需要先有静态服务）：

```bash
npm run build
npm run preview &              # 或任意静态服务器
WEB_URL=http://localhost:4173 npx playwright test
```

## Docker Compose

默认只运行静态 Web（nginx 仅提供 `dist/` 静态文件，无任何后端进程）：

```bash
docker compose up --build              # 宿主端口默认 8080
WEB_PORT=9090 docker compose up --build # WEB_PORT 覆盖宿主端口
```

一次性验收服务（运行 Vitest + Playwright，结束即退出）：

```bash
docker compose run --rm verify
docker compose down      # 验收后清理被拉起的 web 容器
```

`verify` 容器通过内部网络 `http://web:80` 访问静态服务，不依赖宿主端口映射。

## 目录结构

```
src/
  lib/
    width.ts          # 字符宽度（纯函数）
    break.ts          # 校验、候选枚举、唯一断句择优
    width.test.ts     # 宽度独立判据
    break.test.ts     # 断句/平局独立判据（含暴力 oracle）
  App.tsx             # 输入、结果与安全区预览
  …
e2e/subtitle.spec.ts  # Playwright 验收
Dockerfile.web        # 静态 Web 镜像（nginx）
Dockerfile.verify     # 一次性验收镜像
docker-compose.yml
```

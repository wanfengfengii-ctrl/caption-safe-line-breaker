/**
 * 字符宽度判据（与渲染环境无关的纯函数）：
 * - ASCII 字符（码位 <= 0x7F）宽度记 1，含中间保留的空格 U+0020
 * - 其他非 ASCII 字符（汉字、全角标点、emoji 等）宽度记 2
 * 控制字符不应进入宽度计算（由 break.ts 先拒绝）。
 */

export function charWidth(codePoint: number): 1 | 2 {
  return codePoint <= 0x7f ? 1 : 2
}

/** 按 Unicode 码点逐字符统计显示宽度（正确处理代理对，如 emoji）。 */
export function textWidth(text: string): number {
  let width = 0
  for (const ch of text) {
    width += charWidth(ch.codePointAt(0)!)
  }
  return width
}

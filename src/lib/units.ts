import { charWidth } from './width'

/**
 * 显示单元扫描器（项目内固定实现，不依赖运行环境的 Intl.Segmenter）：
 * 把规范化文本切分为不可再拆的可见字形单元，断句只发生在单元边界，
 * 避免把组合音标、国旗或零宽连接符 emoji 等复合字形从中间拆开。
 *
 * 合并规则（按码点顺序扫描）：
 * - 基字符后的组合标记（\p{M}，含组合音标与变体选择符 U+FE00–FE0F、
 *   U+E0100–E01EF）以及肤色修饰符（U+1F3FB–U+1F3FF）并入该基字符所在单元
 * - 区域指示符（U+1F1E6–U+1F1FF）从左到右两两成对，视为一个单元（国旗）；
 *   落单的区域指示符按普通基字符处理
 * - 零宽连接符 U+200D 串起的完整基字符链视为一个单元（如 👨‍👩‍👧）；
 *   链尾缺少基字符时，尾部连接符不并入，留给下一轮独立成单元
 *
 * 退化情形：无基字符的扩展符、孤立连接符，各自成为一个宽 2 的单元。
 * 单元宽度与标点限制均由首个基字符判定（退化单元无基字符，固定宽 2）。
 */

/** 扩展符：组合标记（含变体选择符，属 \p{M}）与肤色修饰符 */
const EXTEND_RE = /[\p{M}\u{1F3FB}-\u{1F3FF}]/u

/** 零宽连接符 U+200D */
const JOINER = '\u200d'

function isExtend(ch: string): boolean {
  return EXTEND_RE.test(ch)
}

function isRegionalIndicator(ch: string): boolean {
  const cp = ch.codePointAt(0)!
  return cp >= 0x1f1e6 && cp <= 0x1f1ff
}

/** 基字符：既不是扩展符也不是连接符的普通字符（含区域指示符） */
function isBaseChar(ch: string): boolean {
  return ch !== JOINER && !isExtend(ch)
}

export interface DisplayUnit {
  /** 起始码点索引（含） */
  start: number
  /** 结束码点索引（不含） */
  end: number
  /** 单元文本（一个或多个码点） */
  text: string
  /** 显示宽度（1 或 2）：由首个基字符判定；退化单元固定为 2 */
  width: 1 | 2
  /** 单元首个码点：非退化单元即首个基字符，用于标点悬挂判定 */
  firstChar: string
  /** 是否为无基字符的退化单元（孤立扩展符 / 孤立连接符，宽 2） */
  degenerate: boolean
}

/**
 * 把文本扫描为显示单元序列；返回单元的 start/end 为码点位置，
 * 拼接全部单元的 text 必与原字符串逐码点相等。
 */
export function scanDisplayUnits(text: string): DisplayUnit[] {
  const chars = Array.from(text)
  const n = chars.length
  const units: DisplayUnit[] = []

  const push = (start: number, end: number, degenerate: boolean) => {
    units.push({
      start,
      end,
      text: chars.slice(start, end).join(''),
      width: degenerate ? 2 : charWidth(chars[start].codePointAt(0)!),
      firstChar: chars[start],
      degenerate,
    })
  }

  let i = 0
  while (i < n) {
    const ch = chars[i]
    // 无基字符的扩展符 / 孤立连接符：各自成为宽 2 的退化单元
    if (ch === JOINER || isExtend(ch)) {
      push(i, i + 1, true)
      i += 1
      continue
    }
    const start = i
    // 区域指示符从左到右两两成对（国旗）；落单的按普通基字符处理
    i += isRegionalIndicator(ch) && i + 1 < n && isRegionalIndicator(chars[i + 1]) ? 2 : 1
    // 基字符后的组合标记 / 变体选择符 / 肤色修饰符并入本单元
    while (i < n && isExtend(chars[i])) i += 1
    // 零宽连接符串起的完整基字符链并入本单元；链尾缺少基字符时，
    // 尾部连接符不并入，留给下一轮成为独立的退化单元
    while (i + 1 < n && chars[i] === JOINER && isBaseChar(chars[i + 1])) {
      i += 2 // 连接符 + 下一个基字符
      while (i < n && isExtend(chars[i])) i += 1
    }
    push(start, i, false)
  }
  return units
}

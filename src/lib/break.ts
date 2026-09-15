import { charWidth } from './width'

export const MIN_MAX_WIDTH = 8
export const MAX_MAX_WIDTH = 24

/**
 * 第二行不得以这些标点开头（句号/顿号/右括号等会造成前一行内容悬挂）。
 * 注意：右双引号 ” 不在此列——引号成对包裹引语，允许其位于第二行行首，
 * 否则会把唯一的等宽断点误判为无解。
 */
const FORBIDDEN_LINE2_START = new Set([
  '，', '。', '！', '？', '；', '：', '、', '）', '】', '》',
])

/** 第一行不得以这些左括号结尾（避免左括号悬挂在行尾） */
const FORBIDDEN_LINE1_END = new Set(['（', '【', '《'])

export type FailureReason =
  | 'empty'
  | 'newline'
  | 'control'
  | 'impossible'
  | 'protected-conflict'

/**
 * 不可拆短语的保护区间，按规范化后文本的 Unicode 字符（码点）位置计：
 * start 为起始字符索引（含），end 为结束字符索引（不含）。
 * 落在区间内部的候选断点（start < i < end）视为非法；区间边界
 * （i === start 或 i === end）仍可断开。
 */
export interface ProtectedRange {
  start: number
  end: number
}

export interface BreakFailure {
  ok: false
  reason: FailureReason
  message: string
}

export interface SingleLineResult {
  ok: true
  split: false
  /** 首尾空格删除后的原文 */
  text: string
  width: number
}

export interface CandidateEvaluation {
  /** 断点位置：第一行包含的码点数，断点在第 index 与第 index+1 个字符之间 */
  index: number
  first: string
  second: string
  firstWidth: number
  secondWidth: number
  widthDiff: number
  legal: boolean
  selected: boolean
  /** 非法原因（合法时为空数组） */
  reasons: string[]
}

export interface SplitLineResult {
  ok: true
  split: true
  text: string
  totalWidth: number
  first: string
  second: string
  firstWidth: number
  secondWidth: number
  breakIndex: number
  candidates: CandidateEvaluation[]
}

export type BreakResult = BreakFailure | SingleLineResult | SplitLineResult

function fail(reason: FailureReason, message: string): BreakFailure {
  return { ok: false, reason, message }
}

function isControlCodePoint(cp: number): boolean {
  return cp < 0x20 || cp === 0x7f || (cp >= 0x80 && cp <= 0x9f)
}

/**
 * 输入校验与规范化：
 * 1. 已有换行（含 \r\n、U+2028/U+2029）→ 拒绝
 * 2. 任何控制字符 → 拒绝
 * 3. 删除首尾空格（trim 同时移除全角空格 U+3000）
 * 4. 删除后为空 → 拒绝
 * 中间空格保留。
 */
export function normalizeInput(raw: string): { text: string } | BreakFailure {
  if (/[\n\r\u2028\u2029]/.test(raw)) {
    return fail(
      'newline',
      '原文已包含换行符：请先在原文中合并为不含换行的单行文本再粘贴。预览已清除，未截断任何字符。',
    )
  }
  for (const ch of raw) {
    const cp = ch.codePointAt(0)!
    if (isControlCodePoint(cp)) {
      const hex = cp.toString(16).toUpperCase().padStart(4, '0')
      return fail(
        'control',
        `原文包含控制字符（U+${hex}）：请删除该不可见字符后重新粘贴。预览已清除，未截断任何字符。`,
      )
    }
  }
  const text = raw.trim()
  if (text === '') {
    return fail('empty', '文本为空：请粘贴一条不含换行的字幕文本（首尾空格会自动删除）。')
  }
  return { text }
}

interface Enumeration {
  candidates: CandidateEvaluation[]
  best: { index: number; firstWidth: number; secondWidth: number; diff: number } | null
}

/**
 * 枚举全部字符间断点并按固定规则择优：
 * - 只保留两行均不超宽、不触发标点悬挂、且不落在保护区间内部的方案
 * - 合法方案中取 |第一行宽 - 第二行宽| 最小者；
 *   并列取第一行更宽者；仍并列（同一总宽下不会发生）取更靠前断点。
 */
function enumerateCandidates(
  chars: string[],
  widths: number[],
  totalWidth: number,
  maxWidth: number,
  range: ProtectedRange | undefined,
): Enumeration {
  const candidates: CandidateEvaluation[] = []
  let best: Enumeration['best'] = null

  let prefix = 0
  for (let i = 1; i < chars.length; i++) {
    prefix += widths[i - 1]
    const firstWidth = prefix
    const secondWidth = totalWidth - prefix
    const reasons: string[] = []

    if (firstWidth > maxWidth) reasons.push('第一行超宽')
    if (secondWidth > maxWidth) reasons.push('第二行超宽')
    if (FORBIDDEN_LINE2_START.has(chars[i])) reasons.push('第二行以禁用标点开头')
    if (FORBIDDEN_LINE1_END.has(chars[i - 1])) reasons.push('第一行以左括号结尾')
    // 区间内部（不含边界）禁止断开；i === start / i === end 仍为合法边界
    if (range && i > range.start && i < range.end) {
      reasons.push('断点落在不可拆短语内部')
    }

    const legal = reasons.length === 0
    const diff = Math.abs(firstWidth - secondWidth)

    if (legal) {
      if (
        best === null ||
        diff < best.diff ||
        // 宽差相同：优先第一行更宽的方案
        (diff === best.diff && firstWidth > secondWidth && best.firstWidth < best.secondWidth)
        // 其余并列情形保留先出现（更靠前）的断点
      ) {
        best = { index: i, firstWidth, secondWidth, diff }
      }
    }

    candidates.push({
      index: i,
      first: chars.slice(0, i).join(''),
      second: chars.slice(i).join(''),
      firstWidth,
      secondWidth,
      widthDiff: diff,
      legal,
      selected: false,
      reasons,
    })
  }

  return { candidates, best }
}

/**
 * 计算唯一断句：
 * - 文本总宽 <= maxWidth 时原样输出一行
 * - 否则枚举每两个相邻字符之间的断点，只保留两行均不超宽、
 *   不触发标点悬挂规则、且不落在保护区间内部的方案
 * - 合法方案中取宽差最小者；并列取第一行更宽者；仍并列取更靠前断点。
 * 绝不截字：成功时 first + second 与规范化后原文严格相等。
 *
 * protectedRange 为可选的不可拆短语保护区间（码点位置，见 ProtectedRange）。
 * 越界部分自动收敛到文本范围；空区间等价于未设置保护。
 * 若保护导致所有断点不可用（去掉保护则有解），返回 protected-conflict，
 * 与文本本身无解的 impossible 相区分。
 */
export function breakSubtitle(
  raw: string,
  maxWidth: number,
  protectedRange?: ProtectedRange,
): BreakResult {
  if (!Number.isInteger(maxWidth) || maxWidth < MIN_MAX_WIDTH || maxWidth > MAX_MAX_WIDTH) {
    throw new RangeError(
      `每行最大宽度必须是 ${MIN_MAX_WIDTH} 至 ${MAX_MAX_WIDTH} 之间的整数，收到: ${String(maxWidth)}`,
    )
  }

  const normalized = normalizeInput(raw)
  if (!('text' in normalized)) return normalized
  const { text } = normalized

  const chars = Array.from(text)
  const widths = chars.map((ch) => charWidth(ch.codePointAt(0)!))
  const totalWidth = widths.reduce((a, b) => a + b, 0)

  if (totalWidth <= maxWidth) {
    return { ok: true, split: false, text, width: totalWidth }
  }

  // 收敛保护区间：越界部分裁掉，空区间视为未设置
  let range: ProtectedRange | undefined
  if (protectedRange) {
    const start = Math.max(0, Math.min(protectedRange.start, chars.length))
    const end = Math.max(0, Math.min(protectedRange.end, chars.length))
    if (start < end) range = { start, end }
  }

  const { candidates, best } = enumerateCandidates(chars, widths, totalWidth, maxWidth, range)

  if (best === null) {
    if (range) {
      // 区分“不可拆短语与当前宽度冲突”与文本本身无解：
      // 去掉保护后若有合法方案，则冲突由保护区间引起
      const unprotected = enumerateCandidates(chars, widths, totalWidth, maxWidth, undefined)
      if (unprotected.best !== null) {
        const phrase = chars.slice(range.start, range.end).join('')
        return fail(
          'protected-conflict',
          `不可拆短语与当前宽度冲突：保护「${phrase}」（第 ${range.start + 1} 至第 ${range.end} 个字符）后，所有字符间断点要么落在短语内部被禁用，要么超宽或造成标点悬挂。原文与标记均已保留、未截断任何字符；请取消标记、缩短短语或调整每行最大宽度。预览已清除。`,
        )
      }
    }
    return fail(
      'impossible',
      `无法在每行最大宽度 ${maxWidth} 内合法分成两行：所有字符间断点都会超宽或造成标点悬挂（第二行以“，。！？；：、）】》开头，或第一行以“（【《”结尾）。原文完整保留、未截断任何字符，请调整最大宽度或修改文字。`,
    )
  }

  const chosen = candidates.find((c) => c.index === best.index)!
  chosen.selected = true
  const first = chars.slice(0, best.index).join('')
  const second = chars.slice(best.index).join('')

  // 完整性不变量：拼接必须逐字符等于规范化原文
  if (first + second !== text) {
    throw new Error('内部错误：断句破坏了原文字符顺序')
  }

  return {
    ok: true,
    split: true,
    text,
    totalWidth,
    first,
    second,
    firstWidth: best.firstWidth,
    secondWidth: best.secondWidth,
    breakIndex: best.index,
    candidates,
  }
}

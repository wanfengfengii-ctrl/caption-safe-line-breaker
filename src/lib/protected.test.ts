import { describe, expect, it } from 'vitest'
import { breakSubtitle } from './break'
import type { BreakResult, ProtectedRange, SplitLineResult } from './break'
import { charWidth } from './width'

const FORBIDDEN_START = new Set(['，', '。', '！', '？', '；', '：', '、', '）', '】', '》'])
const FORBIDDEN_END = new Set(['（', '【', '《'])

function cpWidth(s: string): number {
  let w = 0
  for (const ch of s) w += charWidth(ch.codePointAt(0)!)
  return w
}

type Oracle =
  | { type: 'one' }
  | { type: 'impossible' }
  | { type: 'split'; index: number }

/**
 * 独立判据：按题面重新实现带保护区间的选择逻辑（与 break.ts 无共享代码路径）。
 * 断点 i 落在区间内部（start < i < end）即非法；边界 i === start / i === end 合法。
 */
function oracleBreak(raw: string, maxWidth: number, range?: ProtectedRange): Oracle {
  const chars = Array.from(raw.trim())
  const total = cpWidth(chars.join(''))
  if (total <= maxWidth) return { type: 'one' }
  let prefix = 0
  let best: { i: number; diff: number; fw: number } | null = null
  for (let i = 1; i < chars.length; i++) {
    prefix += charWidth(chars[i - 1].codePointAt(0)!)
    const sw = total - prefix
    const inside = range !== undefined && i > range.start && i < range.end
    const legal =
      prefix <= maxWidth &&
      sw <= maxWidth &&
      !FORBIDDEN_START.has(chars[i]) &&
      !FORBIDDEN_END.has(chars[i - 1]) &&
      !inside
    if (!legal) continue
    const diff = Math.abs(prefix - sw)
    if (
      best === null ||
      diff < best.diff ||
      (diff === best.diff && prefix > sw && !(best.fw > total - best.fw))
    ) {
      best = { i, diff, fw: prefix }
    }
  }
  return best === null ? { type: 'impossible' } : { type: 'split', index: best.i }
}

function expectSplit(r: BreakResult): asserts r is SplitLineResult {
  expect(r.ok).toBe(true)
  if (r.ok) expect(r.split).toBe(true)
}

describe('区间内部禁断', () => {
  it('落在保护区间的候选断点全部判为非法并注明原因，选中断点必在区间外', () => {
    // 16 个全角字符总宽 32，maxWidth 20：宽度可行断点 i ∈ {6..10}，无保护最优 i=8（16/16）
    // 保护「大厅明天上午」（第 7–12 字符，区间 [6,12)）后 i ∈ {7..11} 均在内部被禁
    const text = '政务服务中心大厅明天上午暂停办公'
    const r = breakSubtitle(text, 20, { start: 6, end: 12 })
    expectSplit(r)
    // 唯一幸存断点 i=6（区间起点边界）：第一行恰为机构全称
    expect(r.breakIndex).toBe(6)
    expect(r.first).toBe('政务服务中心')
    expect(r.second).toBe('大厅明天上午暂停办公')
    expect(r.first + r.second).toBe(text)
    // 短语完整未被切开
    expect(r.first + r.second).toContain('大厅明天上午')
    expect(
      r.first.includes('大厅明天上午') || r.second.includes('大厅明天上午'),
    ).toBe(true)
    // 区间内部候选均非法且原因明确
    for (const i of [7, 8, 9, 10, 11]) {
      const c = r.candidates.find((x) => x.index === i)!
      expect(c.legal).toBe(false)
      expect(c.reasons).toContain('断点落在不可拆短语内部')
      expect(c.selected).toBe(false)
    }
    // 区间外候选不因保护被判非法
    const outside = r.candidates.find((x) => x.index === 14)!
    expect(outside.reasons).not.toContain('断点落在不可拆短语内部')
  })

  it('内部禁断按 Unicode 码点位置计算（代理对字符占一个位置）', () => {
    // 码点序列：A B 🙂 C D E F G H（9 个码点，🙂 为代理对，宽 2），总宽 10，maxWidth 8
    // 宽度可行断点 i ∈ {2..7}，无保护最优 i=4（5/5，恰在 🙂 之后）
    // 保护区间 [3,6)（C、D、E）禁 i ∈ {4,5} → 最优退到起点边界 i=3
    const text = 'AB🙂CDEFGH'
    const unprotected = breakSubtitle(text, 8)
    expectSplit(unprotected)
    expect(unprotected.breakIndex).toBe(4)

    const r = breakSubtitle(text, 8, { start: 3, end: 6 })
    expectSplit(r)
    expect(r.breakIndex).toBe(3)
    expect(r.first).toBe('AB🙂')
    expect(Array.from(r.first).length).toBe(3)
    expect(r.first + r.second).toBe(text)
    for (const i of [4, 5]) {
      const c = r.candidates.find((x) => x.index === i)!
      expect(c.legal).toBe(false)
      expect(c.reasons).toContain('断点落在不可拆短语内部')
    }
  })
})

describe('区间边界可断', () => {
  // 12 个 ASCII 字符总宽 12，maxWidth 8：宽度可行断点 i ∈ {4..8}，无保护最优 i=6（6/6）
  const text = 'AAAABBBBCCCC'

  it('区间起点边界是最优解时正常选中', () => {
    // 保护 [6,10)：内部 {7,8,9} 被禁；i=6 恰为起点边界且保持 6/6 最优
    const r = breakSubtitle(text, 8, { start: 6, end: 10 })
    expectSplit(r)
    expect(r.breakIndex).toBe(6)
    expect(r.firstWidth).toBe(6)
    expect(r.secondWidth).toBe(6)
    expect(r.candidates.find((c) => c.index === 6)!.legal).toBe(true)
  })

  it('区间终点边界参与平局并按规则胜出', () => {
    // 保护 [4,8)：内部 {5,6,7} 被禁；边界 i=4（4/8）与 i=8（8/4）宽差并列，
    // 按“第一行更宽”规则选中终点边界 i=8
    const r = breakSubtitle(text, 8, { start: 4, end: 8 })
    expectSplit(r)
    expect(r.breakIndex).toBe(8)
    expect(r.firstWidth).toBe(8)
    expect(r.secondWidth).toBe(4)
    // 起点边界 i=4 同样合法（仅因平局规则落选）
    const c4 = r.candidates.find((c) => c.index === 4)!
    expect(c4.legal).toBe(true)
    expect(c4.selected).toBe(false)
  })

  it('贴首与贴尾区间的远端边界仍可断开', () => {
    // 贴尾区间 [10,12)：只禁 i=11，最优 i=6 不受影响
    const r1 = breakSubtitle(text, 8, { start: 10, end: 12 })
    expectSplit(r1)
    expect(r1.breakIndex).toBe(6)
    // 贴首区间 [0,2)：只禁 i=1，最优 i=6 不受影响
    const r2 = breakSubtitle(text, 8, { start: 0, end: 2 })
    expectSplit(r2)
    expect(r2.breakIndex).toBe(6)
  })
})

describe('无保护回归', () => {
  const validSamples = [
    '各位市民请注意，政务服务中心明天暂停办公一天。',
    '请前往（政务服务大厅）办理相关手续后及时离开。',
    '办理完成后请领取《办事指南》手册留存备查。',
    '短',
    '这是一条用于测试的中文句子包含逗号，还有句号。',
    'A1政务B2服务C3大厅D4窗口E5',
    '通知：周一至周五（节假日顺延）正常对外办公。',
    '甲乙丙丁。戊己庚',
  ]
  // 非法输入同样要求：传不传保护参数，错误结果完全一致
  const invalidSamples = ['', '   ', '第一行\n第二行', '含\b控制字符']
  for (const maxWidth of [8, 16, 24]) {
    for (const text of invalidSamples) {
      it(`非法输入 width=${maxWidth} text=${JSON.stringify(text.slice(0, 6))}`, () => {
        const plain = breakSubtitle(text, maxWidth)
        expect(plain.ok).toBe(false)
        expect(breakSubtitle(text, maxWidth, undefined)).toEqual(plain)
        expect(breakSubtitle(text, maxWidth, { start: 1, end: 2 })).toEqual(plain)
      })
    }
  }
  for (const maxWidth of [8, 10, 12, 16, 20, 24]) {
    for (const text of validSamples) {
      it(`width=${maxWidth} text=${text.slice(0, 10)}`, () => {
        const plain = breakSubtitle(text, maxWidth)
        const explicitUndefined = breakSubtitle(text, maxWidth, undefined)
        // 显式传 undefined 与不传第三参结果完全一致（含错误消息与候选表）
        expect(explicitUndefined).toEqual(plain)
        // 空区间等价于未设置保护
        const emptyRange = breakSubtitle(text, maxWidth, { start: 2, end: 2 })
        expect(emptyRange).toEqual(plain)
        // 与无保护独立判据一致
        const expected = oracleBreak(text, maxWidth)
        if (expected.type === 'one') {
          expect(plain.ok).toBe(true)
          if (plain.ok) expect(plain.split).toBe(false)
        } else if (expected.type === 'impossible') {
          expect(plain.ok).toBe(false)
          if (!plain.ok) expect(plain.reason).toBe('impossible')
        } else {
          expectSplit(plain)
          expect(plain.breakIndex).toBe(expected.index)
        }
      })
    }
  }

  it('单行可容纳时保护区间不改变原样输出', () => {
    const r = breakSubtitle('短文本', 24, { start: 0, end: 2 })
    expect(r.ok).toBe(true)
    if (r.ok && !r.split) {
      expect(r.text).toBe('短文本')
      expect(r.width).toBe(6)
    } else {
      throw new Error('应当一行输出')
    }
  })
})

describe('保护导致所有断点不可用：protected-conflict 与 impossible 区分', () => {
  it('去掉保护本可断句时，报“不可拆短语与当前宽度冲突”', () => {
    // 8 个全角字符总宽 16，maxWidth 8：唯一宽度可行断点 i=4
    // 保护「丙丁戊己」（区间 [2,6)）后 i=4 落入内部 → 全部断点不可用
    const text = '甲乙丙丁戊己庚辛'
    const r = breakSubtitle(text, 8, { start: 2, end: 6 })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('protected-conflict')
      expect(r.message).toContain('不可拆短语与当前宽度冲突')
      expect(r.message).toContain('丙丁戊己')
      expect(r.message).toContain('未截断')
    }
    // 对照：同一文本不加保护可正常断句
    const unprotected = breakSubtitle(text, 8)
    expectSplit(unprotected)
    expect(unprotected.breakIndex).toBe(4)
  })

  it('文本本身无解时仍报 impossible，不归咎于保护区间', () => {
    // 唯一宽度可行断点 i=4 会让第二行以“。”开头，无保护本就无解
    const text = '甲乙丙丁。戊己庚'
    const r = breakSubtitle(text, 8, { start: 0, end: 2 })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('impossible')
      expect(r.message).not.toContain('不可拆短语')
    }
  })

  it('覆盖全部字符的区间使任何断点都被禁用', () => {
    const text = '一二三四五六七八甲乙丙丁'
    const r = breakSubtitle(text, 16, { start: 0, end: 12 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('protected-conflict')
  })
})

describe('与独立暴力判据一致（含保护区间）', () => {
  const samples = [
    '各位市民请注意，政务服务中心明天暂停办公一天。',
    '请前往（政务服务大厅）办理相关手续。',
    '办理完成后请领取《办事指南》手册留存备查。',
    'A1政务B2服务C3大厅D4窗口E5',
    '通知：周一至周五（节假日顺延）正常对外办公。',
    '短通知',
  ]
  /** 针对每条文本生成确定性区间：贴首、贴尾、中段、全覆盖、空区间 */
  function rangesFor(text: string): (ProtectedRange | undefined)[] {
    const n = Array.from(text.trim()).length
    if (n < 2) return [undefined]
    return [
      undefined,
      { start: 0, end: 1 },
      { start: n - 1, end: n },
      { start: Math.floor(n / 3), end: Math.max(Math.floor(n / 3) + 1, Math.ceil((2 * n) / 3)) },
      { start: 0, end: n },
      { start: 1, end: 1 },
    ]
  }
  for (const maxWidth of [8, 10, 12, 16, 20, 24]) {
    for (const text of samples) {
      for (const range of rangesFor(text)) {
        const label = range ? `[${range.start},${range.end})` : '无保护'
        it(`width=${maxWidth} ${label} text=${text.slice(0, 8)}`, () => {
          const r = breakSubtitle(text, maxWidth, range)
          const expected = oracleBreak(text, maxWidth, range)
          if (expected.type === 'one') {
            expect(r.ok).toBe(true)
            if (r.ok) expect(r.split).toBe(false)
          } else if (expected.type === 'impossible') {
            expect(r.ok).toBe(false)
            if (!r.ok) {
              // 独立判据：无解时若去掉保护本可断句，必须报 protected-conflict
              const solvableWithout = oracleBreak(text, maxWidth).type === 'split'
              expect(r.reason).toBe(solvableWithout ? 'protected-conflict' : 'impossible')
            }
          } else {
            expectSplit(r)
            expect(r.breakIndex).toBe(expected.index)
            // 选中断点绝不落在区间内部
            if (range) {
              expect(r.breakIndex > range.start && r.breakIndex < range.end).toBe(false)
            }
            expect(r.first + r.second).toBe(text.trim())
          }
        })
      }
    }
  }
})

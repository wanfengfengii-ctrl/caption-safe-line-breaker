import { describe, expect, it } from 'vitest'
import { breakSubtitle } from './break'
import type { BreakResult, SplitLineResult } from './break'
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
 * 独立判据：完全按照题面重新实现一遍选择逻辑（与 break.ts 无共享代码路径），
 * 暴力枚举所有断点 → 过滤合法 → 宽差最小 / 第一行更宽 / 断点更靠前。
 */
function oracleBreak(raw: string, maxWidth: number): Oracle {
  const chars = Array.from(raw.trim())
  const total = cpWidth(chars.join(''))
  if (total <= maxWidth) return { type: 'one' }
  let prefix = 0
  let best: { i: number; diff: number; fw: number } | null = null
  for (let i = 1; i < chars.length; i++) {
    prefix += charWidth(chars[i - 1].codePointAt(0)!)
    const sw = total - prefix
    const legal =
      prefix <= maxWidth &&
      sw <= maxWidth &&
      !FORBIDDEN_START.has(chars[i]) &&
      !FORBIDDEN_END.has(chars[i - 1])
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

describe('一行可容纳', () => {
  it('宽度恰好等于最大宽度时原样输出', () => {
    const text = '一二三四五六七八' // 宽 16
    const r = breakSubtitle(text, 16)
    expect(r.ok).toBe(true)
    if (r.ok && !r.split) {
      expect(r.text).toBe(text)
      expect(r.width).toBe(16)
    } else {
      throw new Error('应当一行输出')
    }
  })

  it('首尾空格删除后可容纳时输出删除首尾空格后的文本', () => {
    const r = breakSubtitle('   短文本   ', 24)
    expect(r.ok).toBe(true)
    if (r.ok && !r.split) expect(r.text).toBe('短文本')
  })

  it('ASCII 与中文混合按 1/2 计宽', () => {
    // ab中文 = 1+1+2+2 = 6 < 8
    const r = breakSubtitle('ab中文', 8)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.split).toBe(false)
  })
})

describe('必须断两行时的基本约束', () => {
  it('两行均不超宽，且拼接等于原文（不截字）', () => {
    // 23 个全角字符总宽 46，maxWidth 24：可行断点 i=11/12
    const text = '各位市民请注意，政务服务中心明天暂停办公一天。'
    const r = breakSubtitle(text, 24)
    expectSplit(r)
    expect(r.firstWidth).toBeLessThanOrEqual(24)
    expect(r.secondWidth).toBeLessThanOrEqual(24)
    expect(r.first + r.second).toBe(text)
    expect(Array.from(r.first).length).toBe(r.breakIndex)
  })

  it('第二行不得以句号开头：句号不会被顶到第二行行首', () => {
    // 12 个全角字符总宽 24：mw 12 时唯一均衡断点 i=6 恰让第二行以“。”开头（非法）；
    // mw 14 时 i=5（10/14）与 i=7（14/10）宽差并列，取第一行更宽的 i=7
    const r = breakSubtitle('今天天气很好。我们出发吧', 14)
    expectSplit(r)
    expect(FORBIDDEN_START.has(r.second[0])).toBe(false)
    expect(r.second[0]).not.toBe('。')
    // 句号必须随第一行走
    expect(r.first.endsWith('。')).toBe(true)
    expect(r.breakIndex).toBe(7)
  })

  it('第一行不得以左括号结尾', () => {
    // 18 个全角字符总宽 36，maxWidth 18：唯一宽度可行断点 i=9
    const text = '请前往（政务服务大厅）办理相关手续。'
    const r = breakSubtitle(text, 18)
    expectSplit(r)
    expect(FORBIDDEN_END.has(r.first[r.first.length - 1])).toBe(false)
    expect(r.first.endsWith('（')).toBe(false)
    expect(r.first).toContain('（')
  })

  it('右书名号落在第二行行首的断点必须判为非法且不被采用', () => {
    // 9 个全角字符总宽 18，maxWidth 12：
    // i=4 时第二行以“》”开头（非法）；i=3（6/12）宽差 6、i=5（10/8）宽差 2 → 选 i=5
    const text = '甲乙丙丁》戊己庚辛'
    const r = breakSubtitle(text, 12)
    expectSplit(r)
    expect(r.second[0]).not.toBe('》')
    expect(r.breakIndex).toBe(5)
    const illegal = r.candidates.find((c) => c.index === 4)!
    expect(illegal.legal).toBe(false)
    expect(illegal.reasons.join('、')).toContain('禁用标点')
    expect(illegal.selected).toBe(false)
  })

  it('右双引号允许位于第二行行首：等宽断点不再被误判为无解', () => {
    // 8 个全角字符总宽 16，maxWidth 8：唯一不超宽断点是 i=4，
    // 第二行恰以“””开头（chars[4]=”）；右双引号允许行首，故得到 8/8 等宽两行
    const text = '引用“甲”乙丙丁'
    const r = breakSubtitle(text, 8)
    expectSplit(r)
    expect(r.firstWidth).toBe(8)
    expect(r.secondWidth).toBe(8)
    expect(r.breakIndex).toBe(4)
    expect(r.second.startsWith('”')).toBe(true)
    expect(r.first + r.second).toBe(text)
  })
})

describe('宽差最小与平局规则', () => {
  it('选择宽差绝对值最小的合法方案', () => {
    // 12 个汉字总宽 24，maxWidth 16：均衡点 12/12
    const text = '一二三四五六七八甲乙丙丁'
    const r = breakSubtitle(text, 16)
    expectSplit(r)
    expect(Math.abs(r.firstWidth - r.secondWidth)).toBe(0)
    expect(r.breakIndex).toBe(6)
  })

  it('宽差并列时选择第一行更宽的方案', () => {
    // 11 个汉字宽 22，maxWidth 14
    // 断点 i=5: 10/12（第二行更宽）；i=6: 12/10（第一行更宽），宽差均为 2 → 选 i=6
    const text = '一二三四五六七八九十甲'
    const r = breakSubtitle(text, 14)
    expectSplit(r)
    expect(r.firstWidth).toBe(12)
    expect(r.secondWidth).toBe(10)
    expect(r.breakIndex).toBe(6)
  })

  it('非法断点不得参与平局比较', () => {
    // 总宽 = 6 ASCII + 逗号 2 + 8 ASCII = 16，maxWidth 10
    // 断点 i=6 会让第二行以全角逗号开头 → 非法，不得选中；i=7 为 8/8
    const text = 'abcdef，ghijklmn'
    const r = breakSubtitle(text, 10)
    expectSplit(r)
    expect(r.breakIndex).toBe(7)
    expect(r.second[0]).not.toBe('，')
    for (const c of r.candidates) {
      if (!c.legal && c.reasons.some((x) => x.includes('禁用标点'))) {
        expect(c.selected).toBe(false)
      }
    }
  })

  it('同宽字符序列上宽差相同且第一行不更宽时取更靠前的合法断点', () => {
    // 12 个 ASCII 宽 12，maxWidth 8：i=6 为 6/6（diff 0）唯一最优
    const r = breakSubtitle('abcdefghijkl', 8)
    expectSplit(r)
    expect(r.breakIndex).toBe(6)
  })
})

describe('与独立暴力判据一致', () => {
  const samples = [
    '各位市民请注意，政务服务中心明天暂停办公一天。',
    '请前往（政务服务大厅）办理相关手续后及时离开。',
    '办理完成后请领取《办事指南》手册留存备查。',
    '短',
    '这是一条用于测试的中文句子包含逗号，还有句号。',
    'A1政务B2服务C3大厅D4窗口E5',
    '通知：周一至周五（节假日顺延）正常对外办公。',
  ]
  for (const maxWidth of [8, 10, 12, 16, 20, 24]) {
    for (const text of samples) {
      it(`width=${maxWidth} text=${text.slice(0, 10)}`, () => {
        const r = breakSubtitle(text, maxWidth)
        const expected = oracleBreak(text, maxWidth)
        if (expected.type === 'one') {
          expect(r.ok).toBe(true)
          if (r.ok) expect(r.split).toBe(false)
        } else if (expected.type === 'impossible') {
          expect(r.ok).toBe(false)
          if (!r.ok) expect(r.reason).toBe('impossible')
        } else {
          expectSplit(r)
          expect(r.breakIndex).toBe(expected.index)
        }
      })
    }
  }
})

describe('中间空格保留且计宽 1', () => {
  it('中间空格不被删除，影响断点位置', () => {
    const text = '中英文混排 ABCD 空格测试案例'
    const r = breakSubtitle(text, 16)
    expect(r.ok).toBe(true)
    if (r.ok && r.split) {
      expect(r.first + r.second).toBe(text)
      expect(r.first.includes(' ') || r.second.includes(' ')).toBe(true)
      expect(cpWidth(r.first)).toBe(r.firstWidth)
      expect(cpWidth(r.second)).toBe(r.secondWidth)
    }
  })
})

describe('失败情形：不截字并清除预览', () => {
  it('空文本（含纯空格）失败', () => {
    for (const t of ['', '   ']) {
      const r = breakSubtitle(t, 16)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('empty')
    }
  })

  it('制表符按控制字符处理（首尾只删除空格）', () => {
    const r = breakSubtitle('\t', 16)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('control')
  })

  it('包含换行失败（含 U+2028）', () => {
    expect(breakSubtitle('第一行\n第二行', 16).ok).toBe(false)
    const r2 = breakSubtitle('第一行\u2028第二行', 16)
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.reason).toBe('newline')
  })

  it('包含控制字符失败并报告码点', () => {
    const r = breakSubtitle('前面有\b铃声后面', 16)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('control')
      expect(r.message).toContain('U+0008')
    }
  })

  it('无法合法分成两行时失败且明确说明未截断', () => {
    // 8 个全角字符宽 16，maxWidth 8：只有 i=4 的断点两行都不超宽；
    // 令第二行以句号开头使该唯一可行断点非法，其余断点必有一行宽 10 或 12
    const text = '甲乙丙丁。戊己庚'
    const r = breakSubtitle(text, 8)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('impossible')
      expect(r.message).toContain('未截断')
    }
  })

  it('唯一宽度可行断点恰让第一行以左括号结尾时无解', () => {
    // 8 个全角字符宽 16，maxWidth 8：仅 i=4 不超宽，而 chars[3]='（'
    const text = '甲乙丙（戊己庚辛'
    const r = breakSubtitle(text, 8)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('impossible')
  })

  it('超宽参数抛出范围错误', () => {
    expect(() => breakSubtitle('测试文本', 7)).toThrow(RangeError)
    expect(() => breakSubtitle('测试文本', 25)).toThrow(RangeError)
    expect(() => breakSubtitle('测试文本', 12.5)).toThrow(RangeError)
  })
})

import { describe, expect, it } from 'vitest'
import { scanDisplayUnits } from './units'
import { breakSubtitle } from './break'
import type { BreakResult, SplitLineResult } from './break'

/**
 * 独立扫描判据：不引用 units.ts 的任何实现，改用一条正则把文本
 * 直接分词为显示单元（与被测代码的逐码点折叠写法无共享逻辑），
 * 再逐单元比对文本、宽度与码点区间。
 *
 * 规则（题面）：
 * - 基字符 + 后续扩展符（组合标记/变体选择符/肤色）为一个单元
 * - 区域指示符从左到右两两成对为一个单元（国旗）
 * - 零宽连接符串起的完整基字符链为一个单元；链尾缺基字符时尾部连接符独立
 * - 无基字符的扩展符、孤立连接符各自成为宽 2 的退化单元
 * - 宽度由首个基字符判定（码点 <= 0x7F 宽 1，否则宽 2；退化单元宽 2）
 */
const EXT = '[\\p{M}\\u{1F3FB}-\\u{1F3FF}]'
const RI_PAIR = '[\\u{1F1E6}-\\u{1F1FF}]{2}'
const BASE = '[^\\p{M}\\u{1F3FB}-\\u{1F3FF}\\u{200D}]'
const ORACLE_RE = new RegExp(
  `(?:${RI_PAIR}|${BASE})${EXT}*(?:\\u{200D}${BASE}${EXT}*)*|${EXT}|\\u{200D}`,
  'gu',
)

function oracleClusters(text: string): string[] {
  return text.match(ORACLE_RE) ?? []
}

function oracleWidth(cluster: string): 1 | 2 {
  const cps = Array.from(cluster)
  const cp = cps[0].codePointAt(0)!
  const degenerate = cps.length === 1 && new RegExp(`^(?:${EXT}|\\u{200D})$`, 'u').test(cps[0])
  if (degenerate) return 2
  return cp <= 0x7f ? 1 : 2
}

function expectSplit(r: BreakResult): asserts r is SplitLineResult {
  expect(r.ok).toBe(true)
  if (r.ok) expect(r.split).toBe(true)
}

describe('显示单元扫描器：与独立判据一致', () => {
  const corpus = [
    // 组合音标（人名/外文缩写上的声调与重音标记）
    'Re\u0301sume\u0301 办事指南',
    'a\u0300\u0302b',
    'Cafe\u0301 窗口',
    // 国旗（区域指示符成对）
    '🇨🇳',
    '🇦🇧🇨',
    '迎🇨🇳🇺🇸宾',
    // 肤色修饰符
    '👍🏽',
    '👋🏻中文',
    // 变体选择符
    '✈\ufe0f',
    '☑\ufe0f测试',
    // 多段零宽连接符链
    '👨\u200d👩\u200d👧\u200d👦',
    '🏳\ufe0f\u200d🌈',
    '👩🏽\u200d💻\u200d👨\u200d👧',
    // 退化：孤立扩展符 / 孤立连接符 / 链尾缺基字符
    '\u0301',
    '\u0301\u0301x',
    '\u200d',
    'a\u200d',
    '👨\u200d',
    '👨\u200d👩\u200d',
    '\u200d👨',
    // 普通文本回归
    '各位市民请注意，政务服务中心明天暂停办公一天。',
    'A1政务B2服务C3大厅',
    '中英文混排 ABCD 空格测试案例',
  ]

  for (const text of corpus) {
    it(`扫描 ${JSON.stringify(text)}`, () => {
      const units = scanDisplayUnits(text)
      const expected = oracleClusters(text)
      // 单元文本序列一致，且拼接逐码点还原原文
      expect(units.map((u) => u.text)).toEqual(expected)
      expect(units.map((u) => u.text).join('')).toBe(text)
      // 每个单元的宽度与码点区间一致
      let offset = 0
      units.forEach((u, k) => {
        expect(u.width).toBe(oracleWidth(expected[k]))
        expect(u.start).toBe(offset)
        offset += Array.from(expected[k]).length
        expect(u.end).toBe(offset)
      })
    })
  }
})

describe('显示单元扫描器：关键字形显式断言', () => {
  it('组合音标并入前一基字符，宽度由基字符判定', () => {
    const units = scanDisplayUnits('e\u0301')
    expect(units).toHaveLength(1)
    expect(units[0].text).toBe('e\u0301')
    expect(units[0].width).toBe(1) // 基字符 e 为 ASCII
    expect(units[0].degenerate).toBe(false)
    // 汉字 + 组合音标：宽 2
    expect(scanDisplayUnits('姜\u0301')[0].width).toBe(2)
  })

  it('区域指示符两两成对（国旗），落单按普通基字符', () => {
    const flag = scanDisplayUnits('🇨🇳')
    expect(flag).toHaveLength(1)
    expect(flag[0].width).toBe(2)
    expect(flag[0].end).toBe(2)

    const three = scanDisplayUnits('🇦🇧🇨')
    expect(three.map((u) => u.text)).toEqual(['🇦🇧', '🇨'])
  })

  it('肤色修饰符并入前一基字符', () => {
    const units = scanDisplayUnits('👍🏽')
    expect(units).toHaveLength(1)
    expect(units[0].width).toBe(2)
  })

  it('多段零宽连接符链整体为一个单元', () => {
    const family = scanDisplayUnits('👨\u200d👩\u200d👧\u200d👦')
    expect(family).toHaveLength(1)
    expect(family[0].width).toBe(2)
    expect(family[0].end).toBe(7) // 4 emoji + 3 连接符

    const rainbow = scanDisplayUnits('🏳\ufe0f\u200d🌈') // 含变体选择符的连接链
    expect(rainbow).toHaveLength(1)
    expect(rainbow[0].text).toBe('🏳\ufe0f\u200d🌈')
  })

  it('退化：无基字符的扩展符与孤立连接符各按一个宽 2 单元处理', () => {
    const loneMark = scanDisplayUnits('\u0301')
    expect(loneMark).toHaveLength(1)
    expect(loneMark[0].degenerate).toBe(true)
    expect(loneMark[0].width).toBe(2)

    // 连续两个无基字符扩展符：各自独立，不并为一个单元
    const twoMarks = scanDisplayUnits('\u0301\u0301')
    expect(twoMarks).toHaveLength(2)
    expect(twoMarks.every((u) => u.degenerate && u.width === 2)).toBe(true)

    const loneJoiner = scanDisplayUnits('\u200d')
    expect(loneJoiner).toHaveLength(1)
    expect(loneJoiner[0].degenerate).toBe(true)
    expect(loneJoiner[0].width).toBe(2)
  })

  it('连接链末尾缺少基字符时仅将尾部连接符独立处理', () => {
    const units = scanDisplayUnits('👨\u200d')
    expect(units.map((u) => u.text)).toEqual(['👨', '\u200d'])
    expect(units[0].degenerate).toBe(false)
    expect(units[1].degenerate).toBe(true)
    expect(units[1].width).toBe(2)

    // 链中段完整、仅尾部连接符落单
    const chained = scanDisplayUnits('👨\u200d👩\u200d')
    expect(chained.map((u) => u.text)).toEqual(['👨\u200d👩', '\u200d'])
    expect(chained[0].degenerate).toBe(false)
    expect(chained[1].degenerate).toBe(true)
  })
})

describe('断句只在显示单元边界发生', () => {
  it('多段连接链：候选断点不含链内位置，结果不拆开复合字形', () => {
    // 13 个码点、9 个单元（👨\u200d👩\u200d👧 占码点 2–6），各宽 2，总宽 18，mw 10
    // 合法边界仅 k=4（8/10）与 k=5（10/8），宽差并列取第一行更宽 → 码点 9
    const text = '市民👨\u200d👩\u200d👧之家办理业务'
    const r = breakSubtitle(text, 10)
    expectSplit(r)
    expect(r.breakIndex).toBe(9)
    expect(r.first).toBe('市民👨\u200d👩\u200d👧之家')
    expect(r.second).toBe('办理业务')
    expect(r.firstWidth).toBe(10)
    expect(r.secondWidth).toBe(8)
    expect(r.first + r.second).toBe(text)
    // 候选只出现在单元边界（码点 1,2,7,8,9,10,11,12），链内 3–6 无候选
    expect(r.candidates.map((c) => c.index)).toEqual([1, 2, 7, 8, 9, 10, 11, 12])
  })

  it('国旗不被拆开：断点落在旗帜单元边界', () => {
    // 6 个码点、5 个单元（🇨🇳 占码点 2–3），总宽 10，mw 8
    // k=2（4/6）与 k=3（6/4）宽差并列，取第一行更宽 → 码点 4
    const text = '庆祝🇨🇳国庆'
    const r = breakSubtitle(text, 8)
    expectSplit(r)
    expect(r.breakIndex).toBe(4)
    expect(r.first).toBe('庆祝🇨🇳')
    expect(r.second).toBe('国庆')
    expect(r.first + r.second).toBe(text)
    expect(r.candidates.map((c) => c.index)).toEqual([1, 2, 4, 5])
  })

  it('肤色修饰符随基字符移动，不被拆开', () => {
    // 6 个码点、5 个单元（👍🏽 占码点 2–3），总宽 10，mw 8 → 码点 4
    const text = '加油👍🏽加油'
    const r = breakSubtitle(text, 8)
    expectSplit(r)
    expect(r.breakIndex).toBe(4)
    expect(r.first).toBe('加油👍🏽')
    expect(r.second).toBe('加油')
    expect(r.first + r.second).toBe(text)
  })

  it('组合音标宽度由首个基字符判定：ASCII 基字符的组合标记不额外计宽', () => {
    // 8 个码点、4 个单元（e+\u0301 各宽 1），总宽 4 → 一行容纳
    const r = breakSubtitle('e\u0301e\u0301e\u0301e\u0301', 8)
    expect(r.ok).toBe(true)
    if (r.ok && !r.split) {
      expect(r.width).toBe(4)
      expect(r.text).toBe('e\u0301e\u0301e\u0301e\u0301')
    } else {
      throw new Error('应当一行输出')
    }
  })

  it('外文缩写中的组合音标不被断点切开', () => {
    // 12 个码点、10 个单元（e+\u0301 两处），宽 1×6+2×4=14，mw 8
    // k=6（6/8）与 k=7（8/6）宽差并列，取第一行更宽 → 码点 9
    const text = 'Re\u0301sume\u0301办事指南'
    const r = breakSubtitle(text, 8)
    expectSplit(r)
    expect(r.breakIndex).toBe(9)
    expect(r.first).toBe('Re\u0301sume\u0301办')
    expect(r.second).toBe('事指南')
    expect(r.first + r.second).toBe(text)
  })

  it('标点限制由单元首个基字符判定：带组合标记的逗号仍不得位于第二行行首', () => {
    // 9 个码点、8 个单元（，+◌\u20d0 合并），总宽 16，mw 8：唯一不超宽边界 k=4
    // 会让第二行以「，」单元开头 → 无解（组合标记不改变标点判定）
    const r = breakSubtitle('甲乙丙丁，\u20d0戊己庚', 8)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('impossible')
  })

  it('标点限制由单元首个基字符判定：带组合标记的左括号仍不得位于第一行行尾', () => {
    // 9 个码点、8 个单元（（+◌\u20d0 合并），总宽 16，mw 8：唯一不超宽边界 k=4
    // 会让第一行以「（」单元结尾 → 无解
    const r = breakSubtitle('甲乙丙（\u20d0戊己庚辛', 8)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('impossible')
  })

  it('不可拆短语保护区间仍按码点位置生效，与单元边界共同约束', () => {
    // 同「市民👨\u200d👩\u200d👧之家办理业务」mw 10；保护「家办」（码点 [8,10)）后
    // 码点 9 的断点落入区间内部被禁，幸存边界为区间起点码点 8
    const text = '市民👨\u200d👩\u200d👧之家办理业务'
    const r = breakSubtitle(text, 10, { start: 8, end: 10 })
    expectSplit(r)
    expect(r.breakIndex).toBe(8)
    expect(r.first).toBe('市民👨\u200d👩\u200d👧之')
    expect(r.second).toBe('家办理业务')
    expect(r.first + r.second).toBe(text)
    const inside = r.candidates.find((c) => c.index === 9)!
    expect(inside.legal).toBe(false)
    expect(inside.reasons).toContain('断点落在不可拆短语内部')
  })
})

describe('退化输入：孤立扩展符与连接符按宽 2 单元参与断句', () => {
  it('尾部孤立连接符计宽 2，单行可容纳时原样输出', () => {
    // 公(2) 告(2) \u200d(2) = 6 ≤ 8
    const r = breakSubtitle('公告\u200d', 8)
    expect(r.ok).toBe(true)
    if (r.ok && !r.split) {
      expect(r.width).toBe(6)
      expect(r.text).toBe('公告\u200d')
    } else {
      throw new Error('应当一行输出')
    }
  })

  it('连续无基字符扩展符各自计宽 2', () => {
    const r = breakSubtitle('\u0301\u0301', 8)
    expect(r.ok).toBe(true)
    if (r.ok && !r.split) expect(r.width).toBe(4)
  })

  it('退化单元参与两行断句且拼接逐码点还原', () => {
    // 8 个汉字单元 + 尾部孤立连接符（宽 2），总宽 18，mw 10
    // k=4（8/10）与 k=5（10/8）宽差并列，取第一行更宽 → 码点 5
    const text = '甲乙丙丁戊己庚辛\u200d'
    const r = breakSubtitle(text, 10)
    expectSplit(r)
    expect(r.breakIndex).toBe(5)
    expect(r.first).toBe('甲乙丙丁戊')
    expect(r.second).toBe('己庚辛\u200d')
    expect(r.secondWidth).toBe(8) // 3 个汉字 + 孤立连接符（宽 2）
    expect(r.first + r.second).toBe(text)
  })
})

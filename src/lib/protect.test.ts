import { describe, expect, it } from 'vitest'
import { protectedRangeStillValid, selectionToProtectedRange, utf16ToCpIndex } from './protect'

describe('选区 → 保护区间转换（UTF-16 偏移 → Unicode 码点位置）', () => {
  it('普通中文选区直接映射为码点区间', () => {
    // 政(0) 务(1) 服(2) 务(3) 中(4) 心(5) 大(6) 厅(7) …
    const raw = '政务服务中心大厅明天上午暂停办公'
    const r = selectionToProtectedRange(raw, 0, 6)
    expect(r).toEqual({ start: 0, end: 6, phrase: '政务服务中心' })
  })

  it('首尾空格将被删除：选区平移到规范化文本坐标', () => {
    // 两个前导空格 + abcdef + 两个尾随空格；选中 UTF-16 [2,5) 即 'abc'
    const r = selectionToProtectedRange('  abcdef  ', 2, 5)
    expect(r).toEqual({ start: 0, end: 3, phrase: 'abc' })
  })

  it('选区部分覆盖被删除的首部空白时收敛到有效文本', () => {
    // 选中 UTF-16 [0,4)：前两格是空格，有效部分为 'ab'
    const r = selectionToProtectedRange('  abcd', 0, 4)
    expect(r).toEqual({ start: 0, end: 2, phrase: 'ab' })
  })

  it('选区完全落在被删除的首尾空白内时返回 null', () => {
    expect(selectionToProtectedRange('  abc  ', 0, 2)).toBeNull()
    expect(selectionToProtectedRange('  abc  ', 5, 7)).toBeNull()
    expect(selectionToProtectedRange('   ', 0, 2)).toBeNull()
  })

  it('代理对字符（emoji）按一个码点计入位置', () => {
    // UTF-16：a(0) 🙂(1..2) b(3) c(4)；选中 🙂 即 UTF-16 [1,3)
    const raw = 'a🙂bc'
    expect(utf16ToCpIndex(raw, 3)).toBe(2)
    const r = selectionToProtectedRange(raw, 1, 3)
    expect(r).toEqual({ start: 1, end: 2, phrase: '🙂' })
    // 选中 'a🙂'（UTF-16 [0,3)）→ 码点 [0,2)
    expect(selectionToProtectedRange(raw, 0, 3)).toEqual({ start: 0, end: 2, phrase: 'a🙂' })
  })
})

describe('已标记区间在编辑后的有效性', () => {
  const marked = { start: 6, end: 12, phrase: '大厅明天上午' }
  const original = '政务服务中心大厅明天上午暂停办公'

  it('原文未变时保持有效', () => {
    expect(protectedRangeStillValid(original, marked)).toBe(true)
  })

  it('在短语之后追加文字：区间未受影响，标记保留', () => {
    expect(protectedRangeStillValid(original + '，敬请谅解', marked)).toBe(true)
  })

  it('改动短语内任意字符：失效', () => {
    expect(
      protectedRangeStillValid('政务服务中心大厅明天下午暂停办公', marked),
    ).toBe(false)
  })

  it('在短语前插入文字：区间位置偏移，失效', () => {
    expect(protectedRangeStillValid('紧急' + original, marked)).toBe(false)
  })

  it('删除尾部使区间越界：失效', () => {
    expect(protectedRangeStillValid('政务服务中心大厅', marked)).toBe(false)
  })

  it('清空原文：失效', () => {
    expect(protectedRangeStillValid('', marked)).toBe(false)
    expect(protectedRangeStillValid('   ', marked)).toBe(false)
  })
})

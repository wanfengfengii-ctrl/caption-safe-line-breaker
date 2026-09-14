import { describe, expect, it } from 'vitest'
import { charWidth, textWidth } from './width'

/**
 * 独立判据：测试内重新实现宽度模型，不引用被测函数的任何逻辑，
 * 仅依据题面“码点 <= 0x7F 宽 1，否则宽 2；按码点计数”。
 */
function oracleWidth(text: string): number {
  let w = 0
  for (const ch of text) {
    w += ch.codePointAt(0)! <= 0x7f ? 1 : 2
  }
  return w
}

describe('charWidth 宽度判据', () => {
  it('ASCII 可见字符与空格宽度为 1', () => {
    for (const ch of ['A', 'z', '0', '9', ' ', '.', ',', '(', ')', '-', '_']) {
      expect(charWidth(ch.codePointAt(0)!)).toBe(1)
    }
  })

  it('汉字、全角标点及其他非 ASCII 字符宽度为 2', () => {
    for (const ch of ['字', '，', '。', '！', '？', '（', '）', '【', '】', '《', '》', '”', '、', '：']) {
      expect(charWidth(ch.codePointAt(0)!)).toBe(2)
    }
  })

  it('代理对字符（emoji）按一个码点计宽 2', () => {
    expect('😀'.length).toBe(2) // JS 长度为 2 个 UTF-16 单元
    expect(charWidth('😀'.codePointAt(0)!)).toBe(2)
    expect(textWidth('a😀b')).toBe(4)
  })

  it('textWidth 与独立判据在混合文本上一致', () => {
    const cases = [
      'abc',
      '你好',
      '你好 world',
      'A（B）C。',
      '  mid  spaces  ',
      '😀🎉中文mixed１２３',
    ]
    for (const t of cases) {
      expect(textWidth(t)).toBe(oracleWidth(t))
    }
  })
})

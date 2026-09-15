import type { ProtectedRange } from './break'

/**
 * 已标记的不可拆短语：保护区间（码点位置）+ 标记时的短语文本。
 * 保存短语文本是为了在原文被编辑后校验区间是否仍然指向同一段文字。
 */
export interface MarkedPhrase extends ProtectedRange {
  phrase: string
}

/** 把 UTF-16 偏移（textarea 选区使用的单位）换算为 Unicode 码点索引。 */
export function utf16ToCpIndex(s: string, utf16Offset: number): number {
  return Array.from(s.slice(0, utf16Offset)).length
}

/**
 * 把输入框选区（UTF-16 偏移）转换为规范化文本上的保护区间。
 * 规范化会删除首尾空白（trim），因此先把选区整体平移到 trim 后文本坐标，
 * 再收敛到 [0, 字符数]；选区完全落在被删除的首尾空白内时返回 null。
 */
export function selectionToProtectedRange(
  raw: string,
  selStart: number,
  selEnd: number,
): MarkedPhrase | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  // trim 与 trimStart 使用同一空白字符集，首部被删的 UTF-16 长度一致
  const leadingTrimmed = raw.length - raw.trimStart().length
  const baseCp = utf16ToCpIndex(raw, leadingTrimmed)
  const totalCp = Array.from(trimmed).length
  const start = Math.max(0, Math.min(utf16ToCpIndex(raw, selStart) - baseCp, totalCp))
  const end = Math.max(0, Math.min(utf16ToCpIndex(raw, selEnd) - baseCp, totalCp))
  if (start >= end) return null
  const phrase = Array.from(trimmed).slice(start, end).join('')
  return { start, end, phrase }
}

/**
 * 校验已标记区间在最新原文上是否仍然有效：
 * 区间必须落在规范化文本内，且覆盖的字符与标记时的短语逐字符一致。
 * 任何使短语内容或位置发生偏移的编辑都会使其失效。
 */
export function protectedRangeStillValid(raw: string, marked: MarkedPhrase): boolean {
  const chars = Array.from(raw.trim())
  if (marked.start < 0 || marked.start >= marked.end || marked.end > chars.length) {
    return false
  }
  return chars.slice(marked.start, marked.end).join('') === marked.phrase
}

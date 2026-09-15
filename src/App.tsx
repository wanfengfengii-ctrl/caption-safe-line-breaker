import { useMemo, useRef, useState } from 'react'
import { breakSubtitle, MAX_MAX_WIDTH, MIN_MAX_WIDTH } from './lib/break'
import type { BreakResult, CandidateEvaluation } from './lib/break'
import { scanDisplayUnits } from './lib/units'
import { protectedRangeStillValid, selectionToProtectedRange } from './lib/protect'
import type { MarkedPhrase } from './lib/protect'
import { copyToClipboard } from './lib/clipboard'
import './App.css'

const DEFAULT_TEXT = '明天上午九点，请准时参加会议。'

function chars(text: string): string[] {
  return Array.from(text)
}

/** 安全区预览：按显示单元以 1/2 宽度排版，右侧即每行最大宽度边界；受保护字符高亮标出 */
function SafetyZone({
  lines,
  maxWidth,
}: {
  lines: { text: string; key: string; protectFrom?: number; protectTo?: number }[]
  maxWidth: number
}) {
  return (
    <div className="safezone" style={{ ['--mw' as string]: maxWidth }}>
      <div className="safezone-ruler" aria-hidden="true">
        {Array.from({ length: maxWidth }, (_, i) => (
          <span className="ruler-cell" key={i}>
            {i % 2 === 0 ? i + 1 : ''}
          </span>
        ))}
        <span className="ruler-boundary">安全区边界 {maxWidth}</span>
      </div>
      {lines.map((line) => (
        <div className="safezone-line" key={line.key} data-testid="safezone-line">
          {scanDisplayUnits(line.text).map((unit, i) => {
            // 单元码点区间与保护区间（码点位置）相交即高亮
            const protectedUnit =
              line.protectFrom !== undefined &&
              line.protectTo !== undefined &&
              unit.start < line.protectTo &&
              unit.end > line.protectFrom
            const cls =
              (unit.width === 1
                ? unit.text === ' '
                  ? 'gz ch-ascii ch-space'
                  : 'gz ch-ascii'
                : 'gz ch-wide') +
              (protectedUnit ? ' gz-protected' : '') +
              (unit.degenerate ? ' gz-degenerate' : '')
            const codePoints = Array.from(unit.text)
              .map((ch) => `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`)
              .join(' ')
            return (
              <span
                className={cls}
                key={i}
                title={`${codePoints}${protectedUnit ? ' · 不可拆短语' : ''}`}
              >
                {unit.text === ' ' ? '·' : unit.text}
              </span>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function CandidateTable({ candidates }: { candidates: CandidateEvaluation[] }) {
  return (
    <details className="candidates">
      <summary>查看全部候选断点（{candidates.length} 个，均为显示单元边界）</summary>
      <table>
        <thead>
          <tr>
            <th>断点位置</th>
            <th>第一行宽</th>
            <th>第二行宽</th>
            <th>宽差</th>
            <th>判定</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((c) => (
            <tr key={c.index} className={c.selected ? 'row-selected' : c.legal ? '' : 'row-illegal'}>
              <td>
                第 {c.index} / {c.index + 1} 字符之间{c.selected ? '　★ 采用' : ''}
              </td>
              <td>{c.firstWidth}</td>
              <td>{c.secondWidth}</td>
              <td>{c.widthDiff}</td>
              <td>{c.legal ? '合法' : `非法：${c.reasons.join('、')}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

export default function App() {
  const [raw, setRaw] = useState(DEFAULT_TEXT)
  const [maxWidthInput, setMaxWidthInput] = useState('16')
  const [copyMsg, setCopyMsg] = useState('')
  const [marked, setMarked] = useState<MarkedPhrase | null>(null)
  const [protectMsg, setProtectMsg] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const maxWidth = Number(maxWidthInput)
  const widthValid =
    Number.isInteger(maxWidth) && maxWidth >= MIN_MAX_WIDTH && maxWidth <= MAX_MAX_WIDTH

  const result: BreakResult | { ok: false; reason: 'badwidth'; message: string } = useMemo(() => {
    if (!widthValid) {
      return {
        ok: false,
        reason: 'badwidth',
        message: `每行最大宽度必须是 ${MIN_MAX_WIDTH} 至 ${MAX_MAX_WIDTH} 之间的整数。预览已清除。`,
      }
    }
    return breakSubtitle(
      raw,
      maxWidth,
      marked ? { start: marked.start, end: marked.end } : undefined,
    )
  }, [raw, maxWidth, widthValid, marked])

  const trimmed = raw.trim()
  const concatRestored =
    result.ok && result.split ? result.first + result.second === result.text : null

  /** 某一行（从 lineStart 个码点开始、长 lineLen）与保护区间的交集，用于安全区高亮 */
  function lineProtection(
    lineStart: number,
    lineLen: number,
  ): { protectFrom: number; protectTo: number } | undefined {
    if (!marked) return undefined
    const from = Math.max(marked.start - lineStart, 0)
    const to = Math.min(marked.end - lineStart, lineLen)
    return from < to ? { protectFrom: from, protectTo: to } : undefined
  }

  /** 把输入框当前选区标记为不可拆短语（选区按 Unicode 码点位置换算为保护区间） */
  function markSelection() {
    const ta = textareaRef.current
    if (!ta) return
    const { selectionStart, selectionEnd } = ta
    if (selectionStart === selectionEnd) {
      setProtectMsg('请先在输入框中选中一段连续文字（如机构全称、日期或固定口号），再标记为不可拆短语。')
      return
    }
    const range = selectionToProtectedRange(raw, selectionStart, selectionEnd)
    if (!range) {
      setProtectMsg('选区不在规范化后的有效文本内（首尾空白会被自动删除），请重新选择。')
      return
    }
    setMarked(range)
    setProtectMsg(
      `已标记不可拆短语「${range.phrase}」（第 ${range.start + 1} 至第 ${range.end} 个字符）：断点不会落在其内部，两端边界仍可断开。`,
    )
  }

  function unmarkProtection() {
    setMarked(null)
    setProtectMsg('已取消不可拆短语标记，恢复自动断句。')
  }

  function handleTextChange(value: string) {
    setRaw(value)
    setCopyMsg('')
    // 编辑原文可能使已标记区间失效：失效即自动清除标记并提示重新选择
    if (marked && !protectedRangeStillValid(value, marked)) {
      setMarked(null)
      setProtectMsg('原文已修改，不可拆短语标记已失效并自动清除，请重新选择。')
    }
  }

  async function copyResult() {
    if (!result.ok) return
    const payload = result.split ? `${result.first}\n${result.second}` : result.text
    try {
      await copyToClipboard(payload)
      setCopyMsg('已复制：两行结果（中间一个换行符）已写入剪贴板。')
    } catch {
      setCopyMsg('复制失败：浏览器未授权剪贴板，请手动选择上方文本复制。')
    }
  }

  return (
    <main className="page">
      <header className="page-head">
        <h1>政务字幕唯一断句工具</h1>
        <p className="subtitle">
          离线纯前端 · 汉字与全角标点宽 2，ASCII 可见字符宽 1 · 首尾空格自动删除、中间空格保留
          · 仅允许两行，绝不截字
        </p>
      </header>

      <section className="panel" aria-label="输入">
        <label className="field-label" htmlFor="text-input">
          字幕原文（不含换行的单行文本，可直接粘贴）
        </label>
        <textarea
          id="text-input"
          data-testid="text-input"
          ref={textareaRef}
          rows={3}
          value={raw}
          spellCheck={false}
          onChange={(e) => handleTextChange(e.target.value)}
        />
        <div className="controls">
          <label className="width-label" htmlFor="width-input">
            每行最大宽度（{MIN_MAX_WIDTH}–{MAX_MAX_WIDTH}）
          </label>
          <input
            id="width-input"
            data-testid="width-input"
            type="number"
            min={MIN_MAX_WIDTH}
            max={MAX_MAX_WIDTH}
            step={1}
            value={maxWidthInput}
            onChange={(e) => {
              setMaxWidthInput(e.target.value)
              setCopyMsg('')
            }}
          />
          <span className="hint">
            规范化后 {Array.from(trimmed).length} 个字符；首尾空格
            {raw !== trimmed ? '已删除（中间空格保留）' : '无需删除'}
          </span>
        </div>

        {/* 不可拆短语：选中一段连续文字后标记，断点不会落在其内部 */}
        <div className="protect-controls">
          <button
            type="button"
            className="protect-btn"
            data-testid="mark-protected"
            onClick={markSelection}
          >
            将选中文字标记为不可拆短语
          </button>
          {marked && (
            <button
              type="button"
              className="protect-btn protect-btn-clear"
              data-testid="unmark-protected"
              onClick={unmarkProtection}
            >
              取消标记
            </button>
          )}
        </div>
        {marked && (
          <div className="protection-view" data-testid="protection-view">
            <span className="protection-label">不可拆短语（第 {marked.start + 1}–{marked.end} 字符）：</span>
            <span className="protection-chars">
              {chars(trimmed).map((ch, i) => (
                <span
                  key={i}
                  className={i >= marked.start && i < marked.end ? 'pv-ch pv-on' : 'pv-ch'}
                >
                  {ch === ' ' ? '·' : ch}
                </span>
              ))}
            </span>
          </div>
        )}
        {protectMsg && (
          <p className="protect-msg" data-testid="protection-message">
            {protectMsg}
          </p>
        )}
      </section>

      {/* 失败时只渲染说明，旧预览被整体卸载，不会残留 */}
      {!result.ok && (
        <section className="panel panel-error" data-testid="error-panel" role="alert">
          <strong>
            {result.reason === 'protected-conflict' ? '不可拆短语与当前宽度冲突' : '无法生成预览'}
          </strong>
          <p data-testid="error-message">{result.message}</p>
          <p className="error-sub">预览区已清空，原文完整保留在输入框中，未截断任何字符。</p>
          {result.reason === 'protected-conflict' && (
            <p className="error-sub" data-testid="conflict-hint">
              不可拆短语标记仍保留在输入区上方：可点击「取消标记」恢复自动断句，或调整每行最大宽度后重试。
            </p>
          )}
        </section>
      )}

      {result.ok && !result.split && (
        <section className="panel panel-ok" data-testid="result-panel">
          <div className="result-badge ok">一行可容纳，原样输出，不断句</div>
          <div className="line-box" data-testid="line-box">
            <span className="line-tag">第一行（唯一一行）</span>
            <span className="line-text">{result.text}</span>
          </div>
          <ul className="meta" data-testid="meta">
            <li>
              行宽：<strong>{result.width}</strong> / 最大 {maxWidth}
            </li>
            <li>
              完整性：原文字符顺序完整不变（{Array.from(result.text).length} 个字符）
            </li>
          </ul>
          <SafetyZone
            lines={[
              {
                text: result.text,
                key: 'l1',
                ...lineProtection(0, Array.from(result.text).length),
              },
            ]}
            maxWidth={maxWidth}
          />
          <button type="button" className="copy-btn" onClick={copyResult}>
            复制结果（单行）
          </button>
          {copyMsg && (
            <p className="copy-msg" data-testid="copy-message">
              {copyMsg}
            </p>
          )}
        </section>
      )}

      {result.ok && result.split && (
        <section className="panel panel-ok" data-testid="result-panel">
          <div className="result-badge ok">已得到唯一两行断句</div>

          <div className="line-box" data-testid="line-box">
            <span className="line-tag">第一行</span>
            <span className="line-text">{result.first}</span>
          </div>
          <div className="line-box" data-testid="line-box">
            <span className="line-tag">第二行</span>
            <span className="line-text">{result.second}</span>
          </div>

          <ul className="meta" data-testid="meta">
            <li>
              第一行行宽：<strong>{result.firstWidth}</strong> / 最大 {maxWidth}
            </li>
            <li>
              第二行行宽：<strong>{result.secondWidth}</strong> / 最大 {maxWidth}
            </li>
            <li>
              两行宽差绝对值：<strong>{Math.abs(result.firstWidth - result.secondWidth)}</strong>
            </li>
            <li>
              采用断点：<strong data-testid="break-point">
                第 {result.breakIndex} 与第 {result.breakIndex + 1} 个字符之间
              </strong>
              （‘
              {chars(result.text)[result.breakIndex - 1] === ' '
                ? '␠'
                : chars(result.text)[result.breakIndex - 1]}
              ’｜‘
              {chars(result.text)[result.breakIndex] === ' '
                ? '␠'
                : chars(result.text)[result.breakIndex]}
              ’）
            </li>
            <li data-testid="integrity">
              完整性校验：第一行 + 第二行 与规范化原文逐字符一致（
              {Array.from(result.text).length} 个字符，总宽 {result.totalWidth}）
              {concatRestored ? ' ✓' : ' ✗'}
            </li>
          </ul>

          <SafetyZone
            lines={[
              {
                text: result.first,
                key: 'l1',
                ...lineProtection(0, Array.from(result.first).length),
              },
              {
                text: result.second,
                key: 'l2',
                ...lineProtection(result.breakIndex, Array.from(result.second).length),
              },
            ]}
            maxWidth={maxWidth}
          />

          <CandidateTable candidates={result.candidates} />

          <button type="button" className="copy-btn" data-testid="copy-result" onClick={copyResult}>
            复制两行结果（中间含一个换行符）
          </button>
          {copyMsg && (
            <p className="copy-msg" data-testid="copy-message">
              {copyMsg}
            </p>
          )}
        </section>
      )}

      <footer className="page-foot">
        <p>
          断句规则：第二行不得以“，。！？；：、）】》”开头；右双引号“””允许位于第二行行首；第一行不得以“（【《”结尾；两行均不得超宽。
          合法方案取宽差最小，并列取第一行更宽，仍并列取更靠前断点。
          组合音标、国旗与零宽连接符 emoji 等复合字形作为整体显示单元参与断句，不会从中间拆开；断点位置仍按字符（码点）序号展示。
          可在输入框中选中机构全称、日期或固定口号并标记为不可拆短语：断点不会落在短语内部，两端边界仍可断开；修改原文使区间失效时标记自动清除。
        </p>
      </footer>
    </main>
  )
}

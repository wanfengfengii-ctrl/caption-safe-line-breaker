import { useMemo, useState } from 'react'
import { breakSubtitle, MAX_MAX_WIDTH, MIN_MAX_WIDTH } from './lib/break'
import type { BreakResult, CandidateEvaluation } from './lib/break'
import './App.css'

const DEFAULT_TEXT = '明天上午九点，请准时参加会议。'

function chars(text: string): string[] {
  return Array.from(text)
}

/** 安全区预览：按 1/2 宽度逐字排版，右侧即每行最大宽度边界 */
function SafetyZone({
  lines,
  maxWidth,
}: {
  lines: { text: string; key: string }[]
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
          {chars(line.text).map((ch, i) => {
            const cp = ch.codePointAt(0)!
            const cls = cp <= 0x7f ? (ch === ' ' ? 'gz ch-ascii ch-space' : 'gz ch-ascii') : 'gz ch-wide'
            return (
              <span className={cls} key={i} title={`U+${cp.toString(16).toUpperCase().padStart(4, '0')}`}>
                {ch === ' ' ? '·' : ch}
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
      <summary>查看全部字符间候选断点（{candidates.length} 个）</summary>
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
    return breakSubtitle(raw, maxWidth)
  }, [raw, maxWidth, widthValid])

  const trimmed = raw.trim()
  const concatRestored =
    result.ok && result.split ? result.first + result.second === result.text : null

  async function copyResult() {
    if (!result.ok) return
    const payload = result.split ? `${result.first}\n${result.second}` : result.text
    try {
      await navigator.clipboard.writeText(payload)
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
          rows={3}
          value={raw}
          spellCheck={false}
          onChange={(e) => {
            setRaw(e.target.value)
            setCopyMsg('')
          }}
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
      </section>

      {/* 失败时只渲染说明，旧预览被整体卸载，不会残留 */}
      {!result.ok && (
        <section className="panel panel-error" data-testid="error-panel" role="alert">
          <strong>无法生成预览</strong>
          <p data-testid="error-message">{result.message}</p>
          <p className="error-sub">预览区已清空，原文完整保留在输入框中，未截断任何字符。</p>
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
          <SafetyZone lines={[{ text: result.text, key: 'l1' }]} maxWidth={maxWidth} />
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
              { text: result.first, key: 'l1' },
              { text: result.second, key: 'l2' },
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
          断句规则：第二行不得以“，。！？；：、）】》”开头；第一行不得以“（【《”结尾；两行均不得超宽。
          合法方案取宽差最小，并列取第一行更宽，仍并列取更靠前断点。
        </p>
      </footer>
    </main>
  )
}

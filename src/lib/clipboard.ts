/**
 * 复制到剪贴板。
 * 政务内网常以 http://主机名 离线访问，该来源不是“安全上下文”，
 * navigator.clipboard 可能不存在；此时降级为临时 textarea + execCommand('copy')。
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // 授权被拒等情况落到下面的遗留路径
    }
  }

  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.top = '-9999px'
  ta.style.left = '-9999px'
  document.body.appendChild(ta)
  ta.focus()
  ta.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  document.body.removeChild(ta)
  if (!ok) {
    throw new Error('剪贴板复制失败：浏览器未授权，请手动选择文本复制。')
  }
}

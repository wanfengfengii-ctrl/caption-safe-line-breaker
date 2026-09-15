import { expect, test } from '@playwright/test'

const FORBIDDEN_START = ['，', '。', '！', '？', '；', '：', '、', '）', '】', '》']
const FORBIDDEN_END = ['（', '【', '《']

test.beforeEach(async ({ page, context }) => {
  // 允许剪贴板写入，以便验收“复制两行结果”
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
})

test('粘贴长字幕：得到唯一两行、显示行宽与断点，标点不悬挂、字符顺序完整', async ({ page, browserName }) => {
  // 15 个全角字符总宽 30，mw 16：宽度可行断点 i=7（14/16）与 i=8（16/14）；
  // i=8 时第二行以“。”开头（非法），故唯一合法为 i=7
  const text = '今天我们学习文件。明天讨论落实'
  const input = page.getByTestId('text-input')
  await input.click()
  // 清空默认值后真实粘贴：写入系统剪贴板再 Ctrl+V，验收“粘贴到结果”全链路
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Delete')
  await page.evaluate((t) => navigator.clipboard.writeText(t), text)
  await page.keyboard.press(browserName === 'darwin' ? 'Meta+v' : 'Control+v')
  await expect(input).toHaveValue(text)
  await page.getByTestId('width-input').fill('16')

  const panel = page.getByTestId('result-panel')
  await expect(panel).toBeVisible()

  const boxes = page.getByTestId('line-box')
  await expect(boxes).toHaveCount(2)
  const first = (await boxes.nth(0).locator('.line-text').innerText()).trim()
  const second = (await boxes.nth(1).locator('.line-text').innerText()).trim()

  // 不截字、顺序不变
  expect(first + second).toBe(text)
  // 标点不悬挂
  expect(FORBIDDEN_START).not.toContain(second[0])
  expect(FORBIDDEN_END).not.toContain(first[first.length - 1])

  // 显示各自行宽且不超宽
  const meta = page.getByTestId('meta')
  await expect(meta).toContainText('第一行行宽')
  await expect(meta).toContainText('第二行行宽')
  const widthText = await meta.innerText()
  const widths = [...widthText.matchAll(/行宽：?\s*(\d+)/g)].map((m) => Number(m[1]))
  expect(widths.length).toBeGreaterThanOrEqual(2)
  expect(widths[0]).toBeLessThanOrEqual(16)
  expect(widths[1]).toBeLessThanOrEqual(16)

  // 显示采用的字符间断点
  await expect(page.getByTestId('break-point')).toContainText('字符之间')
  // 完整性校验通过
  await expect(page.getByTestId('integrity')).toContainText('✓')

  // 安全区预览渲染两行且不越界
  await expect(page.getByTestId('safezone-line')).toHaveCount(2)
})

test('点击复制：剪贴板得到两行文本（中间恰好一个换行符）', async ({ page }) => {
  const text = '明天上午九点，请准时参加会议。'
  await page.getByTestId('text-input').fill(text)
  await page.getByTestId('width-input').fill('16')

  await page.getByTestId('copy-result').click()
  await expect(page.getByTestId('copy-message')).toContainText('已复制')

  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  const lines = clipboard.split('\n')
  expect(lines).toHaveLength(2)
  expect(lines.join('')).toBe(text)
  expect(FORBIDDEN_START).not.toContain(lines[1][0])
})

test('第二行以右双引号开头时正常等宽断行（不误报无解）', async ({ page }) => {
  // 8 个全角字符总宽 16，mw 8：唯一不超宽断点 i=4，第二行以“””开头
  const text = '引用“甲”乙丙丁'
  await page.getByTestId('text-input').fill(text)
  await page.getByTestId('width-input').fill('8')

  const boxes = page.getByTestId('line-box')
  await expect(boxes).toHaveCount(2)
  const first = (await boxes.nth(0).locator('.line-text').innerText()).trim()
  const second = (await boxes.nth(1).locator('.line-text').innerText()).trim()
  expect(first).toBe('引用“甲')
  expect(second.startsWith('”')).toBe(true)
  expect(first + second).toBe(text)
  await expect(page.getByTestId('error-panel')).toHaveCount(0)
  await expect(page.getByTestId('integrity')).toContainText('✓')
})

test('单行可容纳时原样输出', async ({ page }) => {
  await page.getByTestId('text-input').fill('短通知')
  await page.getByTestId('width-input').fill('16')
  await expect(page.getByTestId('result-panel')).toBeVisible()
  const box = page.getByTestId('line-box')
  await expect(box).toHaveCount(1)
  await expect(box.locator('.line-text')).toHaveText('短通知')
})

test('清空文本后旧预览被清除并明确说明失败，输入框原文未被截断', async ({ page }) => {
  const input = page.getByTestId('text-input')
  await input.fill('明天上午九点，请准时参加会议。')
  await expect(page.getByTestId('result-panel')).toBeVisible()

  await input.fill('')
  await expect(page.getByTestId('result-panel')).toHaveCount(0)
  const errPanel = page.getByTestId('error-panel')
  await expect(errPanel).toBeVisible()
  await expect(page.getByTestId('error-message')).toContainText('文本为空')

  // 输入框内容仍可完整编辑（未被程序截断）
  await input.fill('重新输入的完整通知内容。')
  await expect(page.getByTestId('result-panel')).toBeVisible()
})

test('粘贴含换行的文本：失败、说明原因、清除旧预览', async ({ page }) => {
  const input = page.getByTestId('text-input')
  await input.fill('这是一条正常的通知内容。')
  await expect(page.getByTestId('result-panel')).toBeVisible()

  await input.fill('第一行\n第二行')
  await expect(page.getByTestId('result-panel')).toHaveCount(0)
  await expect(page.getByTestId('error-panel')).toBeVisible()
  await expect(page.getByTestId('error-message')).toContainText('换行')
  // 输入框原文完整保留、未被程序改写
  await expect(input).toHaveValue('第一行\n第二行')
})

test('无法合法两行时：明确失败、绝不截字', async ({ page }) => {
  // 8 个全角字符宽 16，maxWidth 8：唯一不超宽断点让第二行以句号开头
  await page.getByTestId('text-input').fill('甲乙丙丁。戊己庚')
  await page.getByTestId('width-input').fill('8')
  await expect(page.getByTestId('result-panel')).toHaveCount(0)
  await expect(page.getByTestId('error-panel')).toBeVisible()
  await expect(page.getByTestId('error-message')).toContainText('无法')
  await expect(page.getByTestId('error-message')).toContainText('未截断')
  await expect(page.getByTestId('text-input')).toHaveValue('甲乙丙丁。戊己庚')
})

test('选中机构全称标记为不可拆短语：断句避开短语、安全区标出、复制反映实际方案', async ({ page }) => {
  // 16 个全角字符总宽 32，mw 20：无保护最优断点 i=8 把“大厅/明天”之间断开；
  // 保护「大厅明天上午」（第 7–12 字符）后，内部断点 i ∈ {7..11} 全被禁用，
  // 唯一幸存为起点边界 i=6：第一行恰为机构全称
  const text = '政务服务中心大厅明天上午暂停办公'
  const input = page.getByTestId('text-input')
  await input.fill(text)
  await page.getByTestId('width-input').fill('20')

  // 标记前：无保护自动断句
  const boxes = page.getByTestId('line-box')
  await expect(boxes).toHaveCount(2)
  expect((await boxes.nth(0).locator('.line-text').innerText()).trim()).toBe('政务服务中心大厅')

  // 选中第 7–12 个字符「大厅明天上午」并标记
  await input.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(6, 12))
  await page.getByTestId('mark-protected').click()

  // 输入区旁标出受保护文字
  const view = page.getByTestId('protection-view')
  await expect(view).toBeVisible()
  await expect(view).toContainText('大厅明天上午')
  await expect(view.locator('.pv-on')).toHaveCount(6)
  await expect(page.getByTestId('protection-message')).toContainText('已标记不可拆短语')

  // 两行结果避开短语：断点移到短语边界，短语完整留在第二行
  await expect(boxes).toHaveCount(2)
  const first = (await boxes.nth(0).locator('.line-text').innerText()).trim()
  const second = (await boxes.nth(1).locator('.line-text').innerText()).trim()
  expect(first).toBe('政务服务中心')
  expect(second).toBe('大厅明天上午暂停办公')
  expect(first + second).toBe(text)
  expect(second).toContain('大厅明天上午')

  // 行宽与断点反映实际方案
  const meta = page.getByTestId('meta')
  await expect(meta).toContainText('第一行行宽：12')
  await expect(meta).toContainText('第二行行宽：20')
  await expect(page.getByTestId('break-point')).toContainText('第 6 与第 7 个字符之间')
  await expect(page.getByTestId('integrity')).toContainText('✓')

  // 安全区预览标出受保护文字：6 个受保护字符全部在第二行
  await expect(page.getByTestId('safezone-line')).toHaveCount(2)
  await expect(page.getByTestId('safezone-line').nth(0).locator('.gz-protected')).toHaveCount(0)
  await expect(page.getByTestId('safezone-line').nth(1).locator('.gz-protected')).toHaveCount(6)

  // 复制内容反映实际方案
  await page.getByTestId('copy-result').click()
  await expect(page.getByTestId('copy-message')).toContainText('已复制')
  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  expect(clipboard).toBe('政务服务中心\n大厅明天上午暂停办公')
})

test('保护导致所有断点不可用：保留原文与标记、卸载预览、错误与输入错误区分，取消标记后恢复', async ({ page }) => {
  // 8 个全角字符总宽 16，mw 8：唯一宽度可行断点 i=4；
  // 保护「丙丁戊己」（区间 [2,6)）后 i=4 落入内部 → 所有断点不可用
  const text = '甲乙丙丁戊己庚辛'
  const input = page.getByTestId('text-input')
  await input.fill(text)
  await page.getByTestId('width-input').fill('8')
  await expect(page.getByTestId('result-panel')).toBeVisible()

  await input.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(2, 6))
  await page.getByTestId('mark-protected').click()
  await expect(page.getByTestId('protection-view')).toBeVisible()

  // 旧预览被卸载，出现区别于普通输入错误的专属冲突说明
  await expect(page.getByTestId('result-panel')).toHaveCount(0)
  const errPanel = page.getByTestId('error-panel')
  await expect(errPanel).toBeVisible()
  await expect(errPanel.locator('strong')).toHaveText('不可拆短语与当前宽度冲突')
  await expect(page.getByTestId('error-message')).toContainText('不可拆短语与当前宽度冲突')
  await expect(page.getByTestId('error-message')).toContainText('丙丁戊己')
  await expect(page.getByTestId('error-message')).toContainText('未截断')
  await expect(page.getByTestId('conflict-hint')).toBeVisible()

  // 原文与标记均保留
  await expect(input).toHaveValue(text)
  await expect(page.getByTestId('protection-view')).toBeVisible()
  await expect(page.getByTestId('protection-view').locator('.pv-on')).toHaveCount(4)

  // 取消标记后恢复自动断句
  await page.getByTestId('unmark-protected').click()
  await expect(page.getByTestId('protection-view')).toHaveCount(0)
  await expect(page.getByTestId('error-panel')).toHaveCount(0)
  await expect(page.getByTestId('result-panel')).toBeVisible()
  const boxes = page.getByTestId('line-box')
  expect((await boxes.nth(0).locator('.line-text').innerText()).trim()).toBe('甲乙丙丁')
  expect((await boxes.nth(1).locator('.line-text').innerText()).trim()).toBe('戊己庚辛')
})

test('编辑原文后保护失效的直接边界：短语后追加保留标记，改动短语即失效清除', async ({ page }) => {
  const text = '政务服务中心大厅明天上午暂停办公'
  const input = page.getByTestId('text-input')
  await input.fill(text)
  await page.getByTestId('width-input').fill('24')

  await input.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(6, 12))
  await page.getByTestId('mark-protected').click()
  await expect(page.getByTestId('protection-view')).toBeVisible()
  // mw 24 下保护生效：断点被推到起点边界 i=6
  const boxes = page.getByTestId('line-box')
  expect((await boxes.nth(0).locator('.line-text').innerText()).trim()).toBe('政务服务中心')

  // 边界一侧：在短语之后追加文字，区间未受影响，标记保留且继续生效
  await input.fill(text + '，敬请谅解')
  await expect(page.getByTestId('protection-view')).toBeVisible()
  await expect(page.getByTestId('protection-view').locator('.pv-on')).toHaveCount(6)
  // 保护仍在塑造结果：无保护最优断点为 i=11（“…明天上”，把“上午”切开），
  // 保护下断点停在短语终点边界 i=12，第一行完整包含「大厅明天上午」
  expect((await boxes.nth(0).locator('.line-text').innerText()).trim()).toBe(
    '政务服务中心大厅明天上午',
  )

  // 边界另一侧：改动短语内字符（上午→下午），标记失效并自动清除、提示重新选择
  await input.fill('政务服务中心大厅明天下午暂停办公')
  await expect(page.getByTestId('protection-view')).toHaveCount(0)
  await expect(page.getByTestId('protection-message')).toContainText('失效')
  await expect(page.getByTestId('protection-message')).toContainText('重新选择')
  // 恢复无保护自动断句
  await expect(page.getByTestId('result-panel')).toBeVisible()
  expect((await boxes.nth(0).locator('.line-text').innerText()).trim()).toBe('政务服务中心大厅')
  expect((await boxes.nth(1).locator('.line-text').innerText()).trim()).toBe('明天下午暂停办公')
})

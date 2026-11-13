import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const PORT = 5174
const DEBUG = 9333
const BASE = `http://127.0.0.1:${PORT}`

class Cdp {
  private ws!: WebSocket
  private id = 0
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()

  async connect(url: string) {
    this.ws = new WebSocket(url)
    await new Promise<void>((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve())
      this.ws.addEventListener('error', () => reject(new Error('chrome websocket failed')))
    })
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: { message: string } }
      if (!message.id || !this.pending.has(message.id)) return
      const waiter = this.pending.get(message.id)!
      this.pending.delete(message.id)
      if (message.error) waiter.reject(new Error(message.error.message))
      else waiter.resolve(message.result)
    })
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  async eval<T>(expression: string): Promise<T> {
    const result = (await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })) as {
      result?: { value?: T }
      exceptionDetails?: { text?: string }
    }
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'page eval failed')
    return result.result?.value as T
  }

  close() {
    this.ws.close()
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

async function waitFor(url: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // server still booting
    }
    await delay(250)
  }
  throw new Error(`timed out waiting for ${url}`)
}

async function openPage(cdp: Cdp, path: string, width: number, height: number) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 800,
  })
  await cdp.send('Page.navigate', { url: `${BASE}${path}` })
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = await cdp.eval<boolean>(`document.querySelector('[data-preview]') != null && document.readyState === 'complete'`)
    if (ready) return
    await delay(200)
  }
  throw new Error(`preview did not render: ${path}`)
}

async function overflow(cdp: Cdp): Promise<{ scrollWidth: number; clientWidth: number }> {
  return cdp.eval(`(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))()`)
}

const HIDDEN_COPY: { match: string; phrases: string[] }[] = [
  {
    match: 'results',
    phrases: [
      '勾選必須在場的主辦人',
      '取消勾選就不會計算此人的時間',
      '列出的時間足夠本次時長',
      '一週從星期一開始',
      '預設是全部參加者',
      '顏色越深',
      '在日期直欄往下拖曳訂下時段',
    ],
  },
  {
    match: 'events',
    phrases: ['先建立活動，再複製兩條連結', '分享此連結或邀請碼', '主辦人連結可以管理名單'],
  },
  {
    match: 'setup',
    phrases: ['先設定日期與每日時間', '標記最重要的日子', '金圈是活動日', '主辦人連結可以管理名單', '分享此連結或邀請碼'],
  },
  {
    match: 'availability',
    phrases: ['若只標記 NA', '金圈是活動日'],
  },
  {
    match: 'roster',
    phrases: ['加入每位主辦人可出席或無法出席的時間'],
  },
  {
    match: 'members',
    phrases: ['用同樣方式加入參加者', '請在上方加入名稱'],
  },
  {
    match: 'portal',
    phrases: ['填寫你的名稱，點選日期', '若只標記 NA'],
  },
]

async function assertCopyHidden(cdp: Cdp, name: string, path: string) {
  const rule = HIDDEN_COPY.find((item) => path.includes(item.match))
  if (!rule) return
  const text = await cdp.eval<string>(`document.body.innerText`)
  for (const phrase of rule.phrases) {
    assert(!text.includes(phrase), `${name} still shows “${phrase}”`)
  }
}

async function shot(cdp: Cdp, file: string) {
  const result = (await cdp.send('Page.captureScreenshot', { format: 'png' })) as { data: string }
  await writeFile(file, Buffer.from(result.data, 'base64'))
}

async function dragEdge(cdp: Cdp, toHour: string) {
  return cdp.eval<string>(`(async () => {
    const handle = document.querySelector('[data-edge="end"]')
    const iso = handle?.closest('[data-booked]')?.getAttribute('data-booked-iso') ?? ''
    const cell = document.querySelector('[data-slot-grid] [data-day="' + iso + '"][data-hour="${toHour}"]')
    if (!(handle instanceof HTMLElement) || !(cell instanceof HTMLElement)) return 'missing'
    const scroller = handle.closest('[data-slot-grid]')
    if (!(scroller instanceof HTMLElement)) return 'missing'
    scroller.scrollIntoView({ block: 'center' })
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const a = handle.getBoundingClientRect()
      const b = cell.getBoundingClientRect()
      const box = scroller.getBoundingClientRect()
      scroller.scrollLeft += (a.left + b.right) / 2 - (box.left + box.width / 2)
      scroller.scrollTop += (a.top + b.bottom) / 2 - (box.top + box.height / 2)
      const a2 = handle.getBoundingClientRect()
      const b2 = cell.getBoundingClientRect()
      const mid = (Math.min(a2.top, b2.top) + Math.max(a2.bottom, b2.bottom)) / 2
      window.scrollBy(0, mid - window.innerHeight / 2)
    }
    function center(el) {
      const rect = el.getBoundingClientRect()
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    }
    function fire(type, point, el) {
      el.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, clientX: point.x, clientY: point.y,
        pointerId: 1, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1, isPrimary: true,
      }))
    }
    const start = center(handle)
    const end = center(cell)
    fire('pointerdown', start, handle)
    fire('pointermove', end, cell)
    fire('pointerup', end, cell)
    await new Promise((resolve) => setTimeout(resolve, 50))
    return document.querySelector('[data-range-summary]')?.textContent ?? ''
  })()`)
}

async function dragHours(cdp: Cdp, fromHour: string, toHour: string, pointerType: 'mouse' | 'touch', release: boolean, dayIso = '') {
  return cdp.eval<string>(`(async () => {
    const day = ${dayIso ? `'${dayIso}'` : `document.querySelector('[data-slot-grid] [data-hour]')?.getAttribute('data-day') ?? ''`}
    const startEl = document.querySelector('[data-slot-grid] [data-day="' + day + '"][data-hour="${fromHour}"]')
    const endEl = document.querySelector('[data-slot-grid] [data-day="' + day + '"][data-hour="${toHour}"]')
    if (!(startEl instanceof HTMLElement) || !(endEl instanceof HTMLElement)) return 'missing ' + day
    const scroller = startEl.closest('[data-slot-grid]')
    if (!(scroller instanceof HTMLElement)) return 'missing'
    scroller.scrollIntoView({ block: 'center' })
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const a = startEl.getBoundingClientRect()
      const b = endEl.getBoundingClientRect()
      const box = scroller.getBoundingClientRect()
      scroller.scrollLeft += (a.left + b.right) / 2 - (box.left + box.width / 2)
      scroller.scrollTop += (a.top + b.bottom) / 2 - (box.top + box.height / 2)
      const a2 = startEl.getBoundingClientRect()
      const b2 = endEl.getBoundingClientRect()
      const mid = (Math.min(a2.top, b2.top) + Math.max(a2.bottom, b2.bottom)) / 2
      window.scrollBy(0, mid - window.innerHeight / 2)
    }
    await new Promise((resolve) => setTimeout(resolve, 40))
    function center(el) {
      const rect = el.getBoundingClientRect()
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    }
    function fire(type, point, el) {
      el.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        pointerId: 1,
        pointerType: '${pointerType}',
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
        isPrimary: true,
      }))
    }
    const start = center(startEl)
    const end = center(endEl)
    const inside = (point) => point.x >= 4 && point.x <= window.innerWidth - 4 && point.y >= 4 && point.y <= window.innerHeight - 4
    if (!inside(start) || !inside(end)) {
      return 'offscreen ' + JSON.stringify({ start, end, innerWidth: window.innerWidth, innerHeight: window.innerHeight, sameRow: startEl.parentElement === endEl.parentElement })
    }
    fire('pointerdown', start, startEl)
    fire('pointermove', end, endEl)
    if (${release}) fire('pointerup', end, endEl)
    await new Promise((resolve) => setTimeout(resolve, 50))
    return document.querySelector('[data-range-summary]')?.textContent ?? ''
  })()`)
}

async function main() {
  await mkdir('/tmp/syncup-layout', { recursive: true })
  await mkdir('/opt/cursor/artifacts', { recursive: true })
  const root = fileURLToPath(new URL('..', import.meta.url))
  const vite: ChildProcess = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    cwd: root,
    stdio: 'ignore',
    env: { ...process.env, VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture' },
  })
  const chrome: ChildProcess = spawn(
    'google-chrome',
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      `--remote-debugging-port=${DEBUG}`,
      '--remote-allow-origins=*',
      '--user-data-dir=/tmp/syncup-chrome',
      '--window-size=390,844',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )
  try {
    await waitFor(`http://127.0.0.1:${DEBUG}/json/version`)
    await waitFor(BASE)
    const pages = (await (await fetch(`http://127.0.0.1:${DEBUG}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[]
    const page = pages.find((item) => item.type === 'page')
    if (!page) throw new Error('chrome opened no page')
    const cdp = new Cdp()
    await cdp.connect(page.webSocketDebuggerUrl)
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')

    const widths: { name: string; path: string; width: number; height: number; shot?: string }[] = [
      { name: 'results phone', path: '/?preview=results&lang=zh', width: 390, height: 844, shot: '/opt/cursor/artifacts/results-mobile.png' },
      { name: 'results desktop', path: '/?preview=results&lang=zh', width: 1280, height: 800, shot: '/opt/cursor/artifacts/results-desktop.png' },
      { name: 'login phone', path: '/?preview=login&lang=zh', width: 390, height: 844, shot: '/opt/cursor/artifacts/login-mobile.png' },
      { name: 'setup phone', path: '/?preview=setup&lang=zh', width: 390, height: 844, shot: '/opt/cursor/artifacts/setup-mobile.png' },
      { name: 'availability phone', path: '/?preview=availability&lang=zh', width: 390, height: 844 },
      { name: 'events phone', path: '/?preview=events&lang=zh', width: 390, height: 844 },
      { name: 'events desktop', path: '/?preview=events&lang=zh', width: 1280, height: 800 },
      { name: 'roster phone', path: '/?preview=roster&lang=zh', width: 390, height: 844 },
      { name: 'members phone', path: '/?preview=members&lang=zh', width: 390, height: 844 },
      { name: 'portal phone', path: '/?preview=portal&lang=zh', width: 390, height: 844 },
    ]
    for (const item of widths) {
      await openPage(cdp, item.path, item.width, item.height)
      const size = await overflow(cdp)
      assert(size.scrollWidth <= size.clientWidth + 1, `${item.name} overflows: scroll ${size.scrollWidth} > client ${size.clientWidth}`)
      await assertCopyHidden(cdp, item.name, item.path)
      const calendarText = await cdp.eval<string>(`document.body.innerText.includes('Google 日曆') || document.body.innerText.includes('Google Calendar') ? document.body.innerText.slice(0, 500) : ''`)
      assert(calendarText === '', `${item.name} shows Google Calendar: ${calendarText}`)
      if (item.path.includes('results') || item.path.includes('availability') || item.path.includes('setup')) {
        const height = await cdp.eval<number | null>(`document.querySelector('.cal-day')?.getBoundingClientRect().height ?? null`)
        if (item.path.includes('setup') || item.path.includes('results') || item.path.includes('availability')) {
          assert(height != null && height <= 44, `${item.name} calendar cells are ${height}px tall`)
        }
      }
      if (item.path.includes('availability') || item.path.includes('setup')) {
        const grids = await cdp.eval<number>(`document.querySelectorAll('[data-slot-grid]').length`)
        assert(grids === 0, `${item.name} still has a drag grid`)
      }
      if (item.shot) await shot(cdp, item.shot)
    }

    await openPage(cdp, '/?preview=results&lang=zh', 390, 844)
    await cdp.eval(`document.querySelector('.cal-day')?.scrollIntoView({ block: 'center' })`)
    await delay(100)
    const calendarHeight = await cdp.eval<number>(`document.querySelector('.cal-day')?.getBoundingClientRect().height ?? 0`)
    assert(calendarHeight > 0 && calendarHeight <= 40, `results calendar cell is ${calendarHeight}px`)
    await shot(cdp, '/opt/cursor/artifacts/results-calendar-mobile.png')
    const afterScroll = await overflow(cdp)
    assert(afterScroll.scrollWidth <= afterScroll.clientWidth + 1, `results calendar overflows: ${afterScroll.scrollWidth}`)

    await openPage(cdp, '/?preview=results&lang=zh', 390, 844)
    const live = await dragHours(cdp, '19', '21', 'mouse', false)
    assert(live.includes('19:00') && live.includes('21:30') && live.includes('2.5'), `mid-drag summary was "${live}"`)
    const nudge = await cdp.eval<boolean>(`['提早', '延後', '縮短', '加長'].some((label) => document.body.innerText.includes(label))`)
    assert(!nudge, 'results still shows nudge buttons')
    await shot(cdp, '/opt/cursor/artifacts/results-drag-mobile.png')
    const committed = await dragHours(cdp, '19', '21', 'mouse', true)
    assert(committed.includes('19:00') && committed.includes('21:30') && committed.includes('2.5'), `released summary was "${committed}"`)
    const handles = await cdp.eval<number>(`document.querySelectorAll('[data-edge="start"], [data-edge="end"]').length`)
    assert(handles === 2, `booked block is missing resize handles (${handles})`)
    await cdp.eval(`document.querySelector('[data-booked]')?.scrollIntoView({ block: 'center' })`)
    await delay(80)
    await shot(cdp, '/opt/cursor/artifacts/results-block-mobile.png')

    const touched = await dragHours(cdp, '18', '20', 'touch', true)
    assert(touched.includes('18:00') && touched.includes('20:30') && touched.includes('2.5'), `touch summary was "${touched}"`)

    await cdp.eval(`document.querySelector('[data-slot-grid]')?.focus()`)
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37, modifiers: 8 })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37, modifiers: 8 })
    await delay(50)
    const keyed = await cdp.eval<string>(`document.querySelector('[data-range-summary]')?.textContent ?? ''`)
    assert(keyed.includes('20:00') && keyed.includes('2 ') && !keyed.includes('2.5'), `keyboard shorten was "${keyed}"`)

    const grids = await cdp.eval<number>(`document.querySelectorAll('[data-slot-grid]').length`)
    assert(grids === 1, `results should have one booking grid, found ${grids}`)
    const lengthSelects = await cdp.eval<number>(`document.querySelectorAll('select').length`)
    assert(lengthSelects === 0, `results still has a length dropdown (${lengthSelects})`)
    const shortened = await cdp.eval<string>(`document.querySelector('[data-duration-step="down"]')?.click(); 'clicked'`)
    assert(shortened === 'clicked', 'hours stepper missing')
    await delay(60)
    const resized = await cdp.eval<string>(`document.querySelector('[data-range-summary]')?.textContent ?? ''`)
    assert(resized.includes('18:00') && resized.includes('19:30') && resized.includes('1.5'), `duration resize was "${resized}"`)
    const placed = await cdp.eval<string>(`(() => {
      const card = document.querySelector('[data-slot-card]')
      if (!(card instanceof HTMLElement)) return 'no-card'
      card.click()
      return card.dataset.day + ' ' + card.dataset.start + ' ' + card.dataset.end
    })()`)
    await delay(80)
    const [placedDay, placedStart, placedEnd] = placed.split(' ')
    const summaryAfterCard = await cdp.eval<string>(`document.querySelector('[data-range-summary]')?.textContent ?? ''`)
    const clock = (hour: string) => {
      const total = Math.round(Number(hour) * 60)
      return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
    }
    assert(
      summaryAfterCard.includes(clock(placedStart)) && summaryAfterCard.includes(clock(placedEnd)),
      `card did not move the block ("${placed}" -> "${summaryAfterCard}")`,
    )
    const blockDay = await cdp.eval<string>(`document.querySelector('[data-focused]')?.getAttribute('data-day') ?? ''`)
    assert(blockDay === placedDay, `block day ${blockDay} card ${placed}`)
    await cdp.eval(`document.querySelector('[data-duration-hours]')?.scrollIntoView({ block: 'start' })`)
    await delay(60)
    await shot(cdp, '/opt/cursor/artifacts/results_phone_one_session.png')
    const extraDays = await cdp.eval<string>(`(() => {
      const days = [...document.querySelectorAll('[data-day-toggle]')].map((node) => node.getAttribute('data-day-toggle'))
      const index = days.indexOf('${placedDay}')
      const extra = days.slice(index + 1, index + 3)
      for (const iso of extra) document.querySelector('[data-day-toggle="' + iso + '"]')?.click()
      return JSON.stringify(extra)
    })()`)
    await delay(80)
    const multi = await cdp.eval<string>(`JSON.stringify({
      extra: ${extraDays},
      blocks: document.querySelectorAll('[data-booked]').length,
      headers: document.querySelectorAll('[data-selected-day]').length,
    })`)
    const multiParsed = JSON.parse(multi) as { extra: string[]; blocks: number; headers: number }
    assert(multiParsed.blocks === 3 && multiParsed.headers === 3, `day headers did not copy the session (${multi})`)
    await cdp.eval(`document.querySelector('[data-duration-hours]')?.scrollIntoView({ block: 'start' })`)
    await delay(60)
    await shot(cdp, '/opt/cursor/artifacts/results_phone_multi_days.png')
    const filtered = await cdp.eval<string>(`(() => {
      document.querySelector('[data-dancer-id="dancer-ren"]')?.click()
      return 'ok'
    })()`)
    assert(filtered === 'ok', 'dancer filter missing')
    await delay(60)
    const counts = await cdp.eval<string>(`(() => {
      const morning = document.querySelector('[data-day="2026-11-12"][data-hour="9"]')?.textContent ?? ''
      const evening = document.querySelector('[data-day="2026-11-12"][data-hour="18"]')?.textContent ?? ''
      const starts = [...document.querySelectorAll('[data-slot-card]')].map((card) => Number(card.getAttribute('data-start')))
      return JSON.stringify({ morning, evening, starts: starts.slice(0, 8), count: starts.length, late: starts.some((hour) => hour > 11.5) })
    })()`)
    const parsed = JSON.parse(counts) as { morning: string; evening: string; count: number; late: boolean }
    assert(parsed.morning === '1' && parsed.evening === '0' && parsed.count > 0 && !parsed.late, `filtered heatmap/cards were ${counts}`)
    await cdp.eval(`document.querySelector('[data-booked]')?.scrollIntoView({ block: 'center', inline: 'center' })`)
    await delay(80)
    await shot(cdp, '/opt/cursor/artifacts/results_phone_session_block.png')
    await cdp.eval(`document.querySelector('[data-duration-hours]')?.scrollIntoView({ block: 'start' })`)
    await delay(80)
    await shot(cdp, '/opt/cursor/artifacts/results_phone_time_down.png')
    await cdp.eval(`(document.querySelector('[data-selected-slot]') ?? document.querySelector('[data-slot-card]'))?.scrollIntoView({ block: 'center' })`)
    await delay(80)
    await shot(cdp, '/opt/cursor/artifacts/results_phone_filtered_cards.png')
    await cdp.eval(`document.querySelector('[data-dancer-id="all"]')?.click()`)
    await delay(40)
    const restoredCount = await cdp.eval<string>(`document.querySelector('[data-day="2026-11-12"][data-hour="18"]')?.textContent ?? ''`)
    assert(restoredCount === '2', `clearing the dancer filter left the 18:00 count at "${restoredCount}"`)
    const edgeResize = await dragEdge(cdp, '14')
    assert(edgeResize.includes('14:30') && edgeResize.includes('11:30'), `pulling the end edge did not resize ("${edgeResize}")`)
    const otherDay = await cdp.eval<string>(`document.querySelector('[data-booked]:not([data-focused])')?.getAttribute('data-booked-iso') ?? ''`)
    if (otherDay) {
      await dragHours(cdp, '16', '18', 'mouse', true, otherDay)
      await delay(80)
      await cdp.eval(`(() => {
        const scroller = document.querySelector('[data-slot-grid]')
        const blocks = [...document.querySelectorAll('[data-booked]')]
        if (!(scroller instanceof HTMLElement) || blocks.length === 0) return
        const top = Math.min(...blocks.map((el) => el.getBoundingClientRect().top))
        scroller.scrollTop += top - scroller.getBoundingClientRect().top - 6
      })()`)
      await cdp.eval(`document.querySelector('[data-duration-hours]')?.scrollIntoView({ block: 'start' })`)
      await delay(40)
      await shot(cdp, '/opt/cursor/artifacts/results_phone_mixed_times.png')
    }

    const phone = await overflow(cdp)
    assert(phone.scrollWidth <= phone.clientWidth + 1, `results still overflows after drag: ${phone.scrollWidth}`)

    await openPage(cdp, '/?preview=results&lang=zh', 390, 844)
    const aligned = await cdp.eval<number>(`(() => {
      const label = document.querySelector('.heat-time')
      const cell = document.querySelector('[data-slot="0"]')
      if (!(label instanceof HTMLElement) || !(cell instanceof HTMLElement)) return 999
      return Math.abs(label.getBoundingClientRect().top - cell.getBoundingClientRect().top)
    })()`)
    assert(aligned <= 4, `time label sits ${aligned}px off the grid line`)
    const firstSlot = await dragHours(cdp, '9', '10', 'mouse', true)
    assert(firstSlot.includes('09:00') && firstSlot.includes('10:30'), `first session was "${firstSlot}"`)
    const secondSlot = await dragHours(cdp, '19', '21', 'mouse', true)
    assert(secondSlot.includes('19:00') && secondSlot.includes('21:30'), `second session was "${secondSlot}"`)
    const sameDay = await cdp.eval<string>(`(() => {
      const blocks = [...document.querySelectorAll('[data-booked]')]
      const days = blocks.map((el) => el.getAttribute('data-booked-iso'))
      return JSON.stringify({ count: blocks.length, same: days.length === 2 && days[0] === days[1] })
    })()`)
    const sameParsed = JSON.parse(sameDay) as { count: number; same: boolean }
    assert(sameParsed.count === 2 && sameParsed.same, `a day did not keep two sessions (${sameDay})`)
    await cdp.eval(`document.querySelector('[data-remove-session]')?.click()`)
    await delay(40)
    const remaining = await cdp.eval<number>(`document.querySelectorAll('[data-booked]').length`)
    assert(remaining === 1, `removing the focused session left ${remaining}`)
    const multiOverflow = await overflow(cdp)
    assert(multiOverflow.scrollWidth <= multiOverflow.clientWidth + 1, `two sessions overflow: ${multiOverflow.scrollWidth}`)

    await openPage(cdp, '/?preview=results&lang=zh', 1280, 800)
    const desktopBooked = await dragHours(cdp, '19', '21', 'mouse', true)
    assert(desktopBooked.includes('19:00') && desktopBooked.includes('2.5'), `desktop block was "${desktopBooked}"`)
    await cdp.eval(`document.querySelector('[data-booked]')?.scrollIntoView({ block: 'center', inline: 'center' })`)
    await delay(80)
    await shot(cdp, '/opt/cursor/artifacts/results-block-desktop.png')
    await cdp.eval(`document.querySelector('[data-duration-step="down"]')?.click()`)
    await delay(40)
    await cdp.eval(`document.querySelector('[data-slot-card]')?.click()`)
    await delay(40)
    await cdp.eval(`document.querySelector('[data-duration-hours]')?.scrollIntoView({ block: 'start' })`)
    await delay(40)
    await shot(cdp, '/opt/cursor/artifacts/results_desktop_one_session.png')
    await cdp.eval<string>(`(() => {
      const focus = document.querySelector('[data-focused]')?.getAttribute('data-booked-iso')
      const days = [...document.querySelectorAll('[data-day-toggle]')].map((node) => node.getAttribute('data-day-toggle'))
      const index = days.indexOf(focus)
      for (const iso of days.slice(index + 1, index + 3)) document.querySelector('[data-day-toggle="' + iso + '"]')?.click()
      return 'clicked'
    })()`)
    await delay(80)
    const desktopMulti = await cdp.eval<string>(`String(document.querySelectorAll('[data-booked]').length)`)
    assert(desktopMulti === '3', `desktop day copy left ${desktopMulti} blocks`)
    await cdp.eval(`document.querySelector('[data-duration-hours]')?.scrollIntoView({ block: 'start' })`)
    await delay(40)
    await shot(cdp, '/opt/cursor/artifacts/results_desktop_multi_days.png')
    const desktopOther = await cdp.eval<string>(`document.querySelector('[data-booked]:not([data-focused])')?.getAttribute('data-booked-iso') ?? ''`)
    if (desktopOther) await dragHours(cdp, '16', '18', 'mouse', true, desktopOther)
    await delay(60)
    await cdp.eval(`(() => {
      const scroller = document.querySelector('[data-slot-grid]')
      const blocks = [...document.querySelectorAll('[data-booked]')]
      if (!(scroller instanceof HTMLElement) || blocks.length === 0) return
      const top = Math.min(...blocks.map((el) => el.getBoundingClientRect().top))
      scroller.scrollTop += top - scroller.getBoundingClientRect().top - 6
    })()`)
    await cdp.eval(`document.querySelector('[data-duration-hours]')?.scrollIntoView({ block: 'start' })`)
    await delay(40)
    await shot(cdp, '/opt/cursor/artifacts/results_desktop_mixed_times.png')
    await cdp.eval(`document.querySelector('[data-dancer-id="dancer-ren"]')?.click()`)
    await delay(40)
    await cdp.eval(`document.querySelector('[data-booked]')?.scrollIntoView({ block: 'center', inline: 'center' })`)
    await delay(80)
    await shot(cdp, '/opt/cursor/artifacts/results_desktop_session_block.png')
    await cdp.eval(`document.querySelector('[data-duration-hours]')?.scrollIntoView({ block: 'start' })`)
    await delay(80)
    await shot(cdp, '/opt/cursor/artifacts/results_desktop_time_down.png')
    await cdp.eval(`(document.querySelector('[data-selected-slot]') ?? document.querySelector('[data-slot-card]'))?.scrollIntoView({ block: 'center' })`)
    await delay(80)
    await shot(cdp, '/opt/cursor/artifacts/results_desktop_filtered_cards.png')
    const desktopOverflow = await overflow(cdp)
    assert(desktopOverflow.scrollWidth <= desktopOverflow.clientWidth + 1, `desktop block overflows: ${desktopOverflow.scrollWidth}`)

    await openPage(cdp, '/?preview=availability&lang=zh', 390, 844)
    const hourSelects = await cdp.eval<number>(`document.querySelectorAll('select').length`)
    assert(hourSelects >= 2, 'availability is missing the hour dropdowns')
    await cdp.eval(`document.querySelector('select')?.scrollIntoView({ block: 'center' })`)
    await delay(100)
    const restored = await cdp.eval<boolean>(`document.body.innerText.includes('從') && document.body.innerText.includes('到') && !document.body.innerText.includes('提早')`)
    assert(restored, 'availability time entry was not restored')
    await shot(cdp, '/opt/cursor/artifacts/availability-mobile.png')
    const availOverflow = await overflow(cdp)
    assert(availOverflow.scrollWidth <= availOverflow.clientWidth + 1, `availability overflows: ${availOverflow.scrollWidth}`)

    await openPage(cdp, '/?preview=events&lang=zh', 1280, 800)
    const eventsTip = await cdp.eval<string>(`(async () => {
      const button = document.querySelector('[data-info="events"]')
      if (!(button instanceof HTMLElement)) return 'missing'
      button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'mouse', pointerId: 1, isPrimary: true, button: 0 }))
      button.click()
      await new Promise((resolve) => setTimeout(resolve, 50))
      return document.querySelector('[role="tooltip"]')?.textContent ?? ''
    })()`)
    assert(eventsTip.includes('先建立活動，再複製兩條連結'), `events tip was "${eventsTip}"`)
    assert(eventsTip.includes('主辦人連結可以管理名單'), `events tip dropped the link note: "${eventsTip}"`)

    await openPage(cdp, '/?preview=results&lang=zh', 390, 844)
    const datesTip = await cdp.eval<string>(`(async () => {
      const button = document.querySelector('[data-info="dates"]')
      if (!(button instanceof HTMLElement)) return 'missing'
      button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 1, isPrimary: true, button: 0 }))
      button.click()
      await new Promise((resolve) => setTimeout(resolve, 50))
      return document.querySelector('[role="tooltip"]')?.textContent ?? ''
    })()`)
    assert(datesTip.includes('一週從星期一開始'), `dates tip was "${datesTip}"`)
    const datesClosed = await cdp.eval<string>(`(async () => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 1, isPrimary: true, button: 0 }))
      await new Promise((resolve) => setTimeout(resolve, 50))
      return document.querySelector('[role="tooltip"]')?.textContent ?? ''
    })()`)
    assert(datesClosed === '', `dates tip stayed open: "${datesClosed}"`)

    await openPage(cdp, '/?preview=results&lang=zh', 1280, 800)
    const organizer = await cdp.eval<{ x: number; y: number } | null>(`(() => {
      const button = document.querySelector('[data-info="organizers"]')
      if (!(button instanceof HTMLElement)) return null
      const rect = button.getBoundingClientRect()
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    })()`)
    assert(organizer != null, 'organizers info button is missing')
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 8, y: 8, pointerType: 'mouse' })
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: organizer.x, y: organizer.y, pointerType: 'mouse' })
    await delay(80)
    const hovered = await cdp.eval<string>(`document.querySelector('[role="tooltip"]')?.textContent ?? ''`)
    assert(hovered.includes('取消勾選就不會計算此人的時間'), `organizer hover tip was "${hovered}"`)
    assert(hovered.includes('尚未設定時長'), `organizer hover tip dropped the duration note: "${hovered}"`)

    await openPage(cdp, '/dev/results', 390, 844)
    const devPreview = await cdp.eval<string>(`(() => {
      const banner = document.querySelector('[data-dev-banner]')?.textContent ?? ''
      const groups = [...document.querySelectorAll('[data-group-id]')].map((node) => node.textContent?.trim() ?? '').filter((name) => name && name !== '全部')
      const marks = [...document.querySelectorAll('[data-mark]')].map((node) => node.getAttribute('data-mark'))
      const text = document.body.innerText
      return JSON.stringify({
        banner,
        groups,
        marks,
        password: document.querySelector('input[type="password"]') != null,
        signIn: text.includes('登入'),
        google: text.includes('Google'),
        responses: text.includes('已回覆'),
        hours: text.includes('練習時數'),
        avail: text.includes('Avail'),
      })
    })()`)
    const devParsed = JSON.parse(devPreview) as {
      banner: string
      groups: string[]
      marks: string[]
      password: boolean
      signIn: boolean
      google: boolean
      responses: boolean
      hours: boolean
      avail: boolean
    }
    assert(devParsed.banner.includes('示範彩排') && devParsed.banner.includes('不會寫入任何真實活動'), `dev banner was "${devParsed.banner}"`)
    assert(devParsed.groups.includes('主力') && devParsed.groups.includes('後備'), `dev groups were ${devParsed.groups.join(', ')}`)
    assert(devParsed.marks.includes('na') && devParsed.marks.includes('both') && devParsed.marks.includes('ok'), `dev mark filter was ${devParsed.marks.join(', ')}`)
    assert(!devParsed.password && !devParsed.signIn, 'dev results asked for a sign-in')
    assert(!devParsed.google && !devParsed.avail, 'dev results showed calendar or Avail')
    assert(devParsed.responses && devParsed.hours, 'dev results hid the organizer stats')
    const devSize = await overflow(cdp)
    assert(devSize.scrollWidth <= devSize.clientWidth + 1, `dev results overflows: ${devSize.scrollWidth}`)
    await cdp.eval(`document.querySelector('[data-dev-lang="en"]')?.click()`)
    await delay(40)
    const english = await cdp.eval<string>(`document.querySelector('[data-dev-banner]')?.textContent ?? ''`)
    assert(english.includes('Sample rehearsal') && english.includes('Nothing is saved'), `english banner was "${english}"`)
    const englishGroups = await cdp.eval<string>(`[...document.querySelectorAll('[data-group-id]')].map((node) => node.textContent?.trim() ?? '').join('|')`)
    assert(englishGroups.includes('Main') && englishGroups.includes('Reserve'), `english groups were "${englishGroups}"`)

    cdp.close()
    console.log('layout checks passed')
  } finally {
    vite.kill('SIGTERM')
    chrome.kill('SIGTERM')
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

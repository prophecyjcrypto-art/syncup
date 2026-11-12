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

async function shot(cdp: Cdp, file: string) {
  const result = (await cdp.send('Page.captureScreenshot', { format: 'png' })) as { data: string }
  await writeFile(file, Buffer.from(result.data, 'base64'))
}

function boundsExpression(selectors: string[], text: boolean): string {
  return `(() => {
    const selectors = ${JSON.stringify(selectors)}
    const text = ${text ? 'true' : 'false'}
    const nodes = selectors.map((selector) => document.querySelector(selector)).filter((node) => node instanceof Element)
    if (nodes.length !== selectors.length) return null
    let left = Infinity
    let top = Infinity
    let right = -Infinity
    let bottom = -Infinity
    for (const node of nodes) {
      if (!text) {
        const rect = node.getBoundingClientRect()
        left = Math.min(left, rect.left)
        top = Math.min(top, rect.top)
        right = Math.max(right, rect.right)
        bottom = Math.max(bottom, rect.bottom)
        continue
      }
      const range = document.createRange()
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        if (!walker.currentNode.textContent?.trim()) continue
        range.selectNodeContents(walker.currentNode)
        const rect = range.getBoundingClientRect()
        if (rect.width < 1 || rect.height < 1) continue
        left = Math.min(left, rect.left - 18)
        top = Math.min(top, rect.top)
        right = Math.max(right, rect.right)
        bottom = Math.max(bottom, rect.bottom)
      }
    }
    if (!Number.isFinite(left)) return null
    return { left, top, right, bottom }
  })()`
}

async function shotElements(cdp: Cdp, file: string, selectors: string[], text = false) {
  const box = await cdp.eval<{ x: number; y: number; width: number; height: number } | null>(`(() => {
    const bounds = ${boundsExpression(selectors, text)}
    if (!bounds) return null
    const pad = 12
    const x = Math.max(0, Math.floor(bounds.left - pad))
    const y = Math.max(0, Math.floor(bounds.top - pad))
    const width = Math.min(window.innerWidth - x, Math.ceil(bounds.right + pad) - x)
    const height = Math.min(window.innerHeight - y, Math.ceil(bounds.bottom + pad) - y)
    const cut = bounds.bottom > window.innerHeight - 4 || bounds.top < 4
    if (width < 8 || height < 8 || cut) return null
    return { x, y, width, height }
  })()`)
  if (!box) throw new Error(`missing crop: ${selectors.join(', ')}`)
  const result = (await cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: { ...box, scale: 1 },
  })) as { data: string }
  await writeFile(file, Buffer.from(result.data, 'base64'))
}

async function centerSelectors(cdp: Cdp, selectors: string[]) {
  await cdp.eval(`(() => {
    const margin = 36
    const read = ${boundsExpression(selectors, true)}
    if (!read) return
    if (read.bottom > window.innerHeight - margin) window.scrollBy(0, read.bottom - (window.innerHeight - margin))
    const next = ${boundsExpression(selectors, true)}
    if (next && next.top < margin) window.scrollBy(0, next.top - margin)
  })()`)
  await delay(120)
}

async function dismissGuide(cdp: Cdp, id: string) {
  const armed = await cdp.eval<string>(`(() => {
    const box = document.querySelector('dialog[data-guide="${id}"] [data-guide-never]')
    if (!(box instanceof HTMLInputElement) || box.checked) return 'bad-initial'
    box.click()
    const confirm = document.querySelector('dialog[data-guide="${id}"] [data-guide-confirm]')
    return confirm instanceof HTMLButtonElement && !confirm.disabled ? 'armed' : 'still-disabled'
  })()`)
  assert(armed === 'armed', `guide ${id} did not enable confirm: ${armed}`)
  const closed = await cdp.eval<string>(`(() => {
    const confirm = document.querySelector('dialog[data-guide="${id}"] [data-guide-confirm]')
    if (!(confirm instanceof HTMLButtonElement) || confirm.disabled) return 'not-ready'
    confirm.click()
    return 'clicked'
  })()`)
  assert(closed === 'clicked', `guide ${id} confirm failed: ${closed}`)
  await delay(50)
  const still = await cdp.eval<boolean>(`document.querySelector('dialog[data-guide="${id}"]') != null`)
  assert(!still, `guide ${id} stayed open after confirm`)
  const stored = await cdp.eval<string>(`localStorage.getItem('syncup.guide.dismissed.${id}') ?? ''`)
  assert(stored === '1', `guide ${id} did not persist dismissal`)
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
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true })

    const widths: { name: string; path: string; width: number; height: number; shot?: string }[] = [
      { name: 'results phone', path: '/?preview=results&lang=zh', width: 390, height: 844, shot: '/opt/cursor/artifacts/results-mobile.png' },
      { name: 'results desktop', path: '/?preview=results&lang=zh', width: 1280, height: 800, shot: '/opt/cursor/artifacts/results-desktop.png' },
      { name: 'login phone', path: '/?preview=login&lang=zh', width: 390, height: 844, shot: '/opt/cursor/artifacts/login-mobile.png' },
      { name: 'setup phone', path: '/?preview=setup&lang=zh', width: 390, height: 844, shot: '/opt/cursor/artifacts/setup-mobile.png' },
      { name: 'availability phone', path: '/?preview=availability&lang=zh', width: 390, height: 844 },
    ]
    for (const item of widths) {
      await openPage(cdp, item.path, item.width, item.height)
      const size = await overflow(cdp)
      assert(size.scrollWidth <= size.clientWidth + 1, `${item.name} overflows: scroll ${size.scrollWidth} > client ${size.clientWidth}`)
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
      if (item.path.includes('results')) {
        const guide = JSON.parse(await cdp.eval<string>(`(() => {
          const dialog = document.querySelector('dialog[data-guide="results"]')
          const confirm = dialog?.querySelector('[data-guide-confirm]')
          const box = dialog?.querySelector('[data-guide-never]')
          const active = document.activeElement
          const ring = active instanceof Element ? getComputedStyle(active) : null
          const sample = dialog?.querySelector('li')
          return JSON.stringify({
            open: dialog instanceof HTMLDialogElement && dialog.open,
            modal: dialog?.getAttribute('aria-modal') ?? '',
            labelled: dialog?.getAttribute('aria-labelledby') ?? '',
            bullets: [...(dialog?.querySelectorAll('li') ?? [])].map((node) => node.textContent),
            disabled: confirm instanceof HTMLButtonElement ? confirm.disabled : null,
            checked: box instanceof HTMLInputElement ? box.checked : null,
            focused: dialog?.contains(active) === true,
            active: active instanceof Element ? active.tagName + '.' + active.className : '',
            outline: ring?.outlineWidth ?? '',
            style: ring?.outlineStyle ?? '',
            offset: ring?.outlineOffset ?? '',
            ring: ring?.outlineColor ?? '',
            color: sample ? getComputedStyle(sample).color : '',
          })
        })()`)) as {
          open: boolean
          modal: string
          labelled: string
          bullets: string[]
          disabled: boolean | null
          checked: boolean | null
          focused: boolean
          outline: string
          offset: string
          color: string
        }
        assert(guide.open && guide.modal === 'true' && guide.labelled === 'guide-results-title', `${item.name} guide is not a named dialog`)
        assert(guide.disabled === true && guide.checked === false, `${item.name} confirm should stay disabled until the box is ticked`)
        assert(guide.focused, `${item.name} did not move focus into the guide`)
        assert(
          guide.style === 'solid' && parseFloat(guide.outline) >= 2 && parseFloat(guide.offset) >= 2 && guide.ring === 'rgb(246, 207, 122)',
          `${item.name} focus ring is ${guide.outline} ${guide.style} ${guide.ring} offset ${guide.offset}`,
        )
        assert(
          guide.bullets.join('\n') === '拖曳訂時段，拉上下兩邊調校長短\n點其他日期，即可加上同一時間\n數字代表有幾多人有空；顏色愈深，人愈多',
          `${item.name} results copy was ${guide.bullets.join(' | ')}`,
        )
        assert(guide.color === 'rgb(245, 245, 247)', `${item.name} guide text color is ${guide.color}`)
        await shotElements(
          cdp,
          item.width < 800 ? '/opt/cursor/artifacts/results-phone-guide-hk.png' : '/opt/cursor/artifacts/results-desktop-guide-hk.png',
          ['dialog[data-guide="results"]'],
        )
      }
      if (item.shot) await shot(cdp, item.shot)
    }

    await openPage(cdp, '/?preview=organizers&lang=zh', 390, 844)
    const organizerSize = await overflow(cdp)
    assert(organizerSize.scrollWidth <= organizerSize.clientWidth + 1, `organizers phone overflows: ${organizerSize.scrollWidth}`)
    const organizers = JSON.parse(await cdp.eval<string>(`(() => {
      const dialog = document.querySelector('dialog[data-guide="organizers"]')
      const confirm = dialog?.querySelector('[data-guide-confirm]')
      return JSON.stringify({
        open: dialog instanceof HTMLDialogElement && dialog.open,
        disabled: confirm instanceof HTMLButtonElement ? confirm.disabled : null,
        bullets: [...(dialog?.querySelectorAll('li') ?? [])].map((node) => node.textContent),
      })
    })()`)) as { open: boolean; disabled: boolean | null; bullets: string[] }
    assert(organizers.open && organizers.disabled === true, 'organizers guide was not waiting for a tick')
    assert(
      organizers.bullets.join('\n') === '輸入名稱即可加入\n標成 Avail 或 NA\n要所有已勾選的主辦人都有空，先會見到結果',
      `organizers copy was ${organizers.bullets.join(' | ')}`,
    )
    await shotElements(cdp, '/opt/cursor/artifacts/organizers-phone-guide-hk.png', ['dialog[data-guide="organizers"]'])

    await openPage(cdp, '/?preview=results&lang=zh', 390, 844)
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await delay(60)
    const stayed = await cdp.eval<boolean>(`document.querySelector('dialog[data-guide="results"]')?.open === true`)
    assert(stayed, 'Escape dismissed the results guide')
    const chips = JSON.parse(await cdp.eval<string>(`(() => {
      const row = document.querySelector('.chip-wrap')
      const buttons = [...(row?.querySelectorAll('button') ?? [])]
      return JSON.stringify({
        wrap: row ? getComputedStyle(row).flexWrap : '',
        count: buttons.length,
        buttons: buttons.every((button) => button.tagName === 'BUTTON' && button.getAttribute('aria-pressed') != null),
      })
    })()`)) as { wrap: string; count: number; buttons: boolean }
    assert(chips.wrap === 'wrap' && chips.count === 5 && chips.buttons, `dancer filters were ${JSON.stringify(chips)}`)
    await dismissGuide(cdp, 'results')
    const hints = JSON.parse(await cdp.eval<string>(`JSON.stringify({
      list: [...document.querySelectorAll('.hint-list li')].map((node) => node.textContent),
      length: document.querySelector('[data-hint-length]')?.textContent ?? '',
      color: getComputedStyle(document.querySelector('.hint-list')).color,
    })`)) as { list: string[]; length: string; color: string }
    assert(
      hints.list.join('\n') === '數字代表有幾多人有空；顏色愈深，人愈多\n拖曳訂時段，拉上下兩邊調校長短\n點其他日期，即可加上同一時間',
      `leftover hints were ${hints.list.join(' | ')}`,
    )
    assert(hints.length === '+ / − 每次改半小時', `length hint was "${hints.length}"`)
    assert(hints.color === 'rgb(228, 228, 231)', `hint color is ${hints.color}`)
    await centerSelectors(cdp, ['[data-hint-length]', '.chip-wrap', '.hint-list'])
    await shotElements(cdp, '/opt/cursor/artifacts/results-phone-hints-hk.png', ['[data-hint-length]', '.chip-wrap', '.hint-list'], true)
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

    await openPage(cdp, '/?preview=results&lang=zh', 1280, 800)
    const desktopGuide = await cdp.eval<boolean>(`document.querySelector('dialog[data-guide="results"]') != null`)
    assert(!desktopGuide, 'dismissing the results guide did not stick')
    const organizersStill = await cdp.eval<string>(`localStorage.getItem('syncup.guide.dismissed.organizers') ?? ''`)
    assert(organizersStill === '', 'dismissing results also hid the organizers guide')
    await centerSelectors(cdp, ['[data-hint-length]', '.chip-wrap', '.hint-list'])
    await shotElements(cdp, '/opt/cursor/artifacts/results-desktop-hints-hk.png', ['[data-hint-length]', '.chip-wrap', '.hint-list'], true)
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

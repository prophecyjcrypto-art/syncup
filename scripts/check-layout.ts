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

async function pair(cdp: Cdp, startHour: string, endHour: string) {
  return cdp.eval<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(`(() => {
    const root = document.querySelector('[data-slot-grid]')
    root?.scrollIntoView({ block: 'center' })
    function center(hour) {
      const el = document.querySelector('[data-slot-grid] [data-hour="' + hour + '"]')
      if (!el) return null
      const rect = el.getBoundingClientRect()
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    }
    const start = center(${JSON.stringify(startHour)})
    const end = center(${JSON.stringify(endHour)})
    if (!start || !end) return null
    return { start, end }
  })()`)
}

async function mouse(cdp: Cdp, type: 'mousePressed' | 'mouseMoved' | 'mouseReleased', x: number, y: number) {
  await cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 })
}

async function touch(cdp: Cdp, type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
  })
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
    ]
    for (const item of widths) {
      await openPage(cdp, item.path, item.width, item.height)
      const size = await overflow(cdp)
      assert(size.scrollWidth <= size.clientWidth + 1, `${item.name} overflows: scroll ${size.scrollWidth} > client ${size.clientWidth}`)
      const calendarText = await cdp.eval<string>(`document.body.innerText.includes('Google 日曆') || document.body.innerText.includes('Google Calendar') ? document.body.innerText.slice(0, 500) : ''`)
      assert(calendarText === '', `${item.name} shows Google Calendar: ${calendarText}`)
      if (item.path.includes('results') || item.path.includes('availability') || item.path.includes('setup')) {
        const height = await cdp.eval<number | null>(`document.querySelector('.cal-day')?.getBoundingClientRect().height ?? null`)
        if (item.path.includes('setup') || item.path.includes('results')) {
          assert(height != null && height <= 44, `${item.name} calendar cells are ${height}px tall`)
        }
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

    await openPage(cdp, '/?preview=availability&lang=zh', 390, 844)
    const drag = await pair(cdp, '19', '21')
    assert(drag != null, 'availability grid is missing 19:00 or 21:00')
    await mouse(cdp, 'mousePressed', drag.start.x, drag.start.y)
    await mouse(cdp, 'mouseMoved', drag.end.x, drag.end.y)
    await delay(100)
    await shot(cdp, '/opt/cursor/artifacts/availability-drag-mobile.png')
    const live = await cdp.eval<string>(`document.querySelector('[data-range-summary]')?.textContent ?? ''`)
    assert(live.includes('19:00') && live.includes('21:30') && live.includes('2.5'), `mid-drag summary was "${live}"`)
    await mouse(cdp, 'mouseReleased', drag.end.x, drag.end.y)
    await delay(50)
    const committed = await cdp.eval<string>(`document.querySelector('[data-range-summary]')?.textContent ?? ''`)
    assert(committed.includes('19:00') && committed.includes('21:30') && committed.includes('2.5'), `released summary was "${committed}"`)
    await shot(cdp, '/opt/cursor/artifacts/availability-selected-mobile.png')

    const finger = await pair(cdp, '18', '20')
    assert(finger != null, 'touch drag targets missing')
    await touch(cdp, 'touchStart', finger.start.x, finger.start.y)
    await touch(cdp, 'touchMove', finger.end.x, finger.end.y)
    await touch(cdp, 'touchEnd')
    await delay(50)
    const touched = await cdp.eval<string>(`document.querySelector('[data-range-summary]')?.textContent ?? ''`)
    assert(touched.includes('18:00') && touched.includes('20:30') && touched.includes('2.5'), `touch summary was "${touched}"`)

    await cdp.eval(`document.querySelector('[data-slot-grid]')?.focus()`)
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37, modifiers: 8 })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37, modifiers: 8 })
    await delay(50)
    const keyed = await cdp.eval<string>(`document.querySelector('[data-range-summary]')?.textContent ?? ''`)
    assert(keyed.includes('20:00') && keyed.includes('2 ') && !keyed.includes('2.5'), `keyboard shorten was "${keyed}"`)

    const phone = await overflow(cdp)
    assert(phone.scrollWidth <= phone.clientWidth + 1, `availability still overflows after drag: ${phone.scrollWidth}`)
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

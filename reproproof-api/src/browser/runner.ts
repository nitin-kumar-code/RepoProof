import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page, type Video } from 'playwright'
import { installApprovedRequestGuard } from '../services/targetValidation'
import { BrowserTelemetry } from './telemetry'
import { env } from '../config/env'

export interface BrowserRun {
  browser: Browser
  context: BrowserContext
  page: Page
  telemetry: BrowserTelemetry
  runDirectory: string
  close: () => Promise<string | undefined>
}

export async function createBrowserRun(runDirectory: string, options: { recordVideo?: boolean } = {}): Promise<BrowserRun> {
  await mkdir(path.join(runDirectory, 'video'), { recursive: true, mode: 0o700 })
  await mkdir(path.join(runDirectory, 'screenshots'), { recursive: true, mode: 0o700 })

  const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] })
  let context: BrowserContext | undefined
  let video: Video | undefined
  let closed = false
  let videoPath: string | undefined
  try {
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      serviceWorkers: 'block',
      ...(options.recordVideo ? { recordVideo: { dir: path.join(runDirectory, 'video'), size: { width: 1280, height: 720 } } } : {}),
    })
    const page = await context.newPage()
    page.setDefaultTimeout(10_000)
    page.setDefaultNavigationTimeout(10_000)
    video = options.recordVideo ? page.video() ?? undefined : undefined
    const telemetry = new BrowserTelemetry()
    telemetry.attach(page)
    const requestAuthorization = env.BUGLAB_API_BASE_URL && env.APPROVAL_USERNAME && env.APPROVAL_PASSWORD
      ? {
          origin: new URL(env.BUGLAB_API_BASE_URL).origin,
          header: `Basic ${Buffer.from(`${env.APPROVAL_USERNAME}:${env.APPROVAL_PASSWORD}`, 'utf8').toString('base64')}`,
        }
      : undefined
    await installApprovedRequestGuard(page, requestAuthorization)

    const close = async (): Promise<string | undefined> => {
      if (closed) return videoPath
      closed = true
      try {
        await context?.close()
        if (video) {
          try {
            videoPath = await video.path()
          } catch {
            videoPath = undefined
          }
        }
        return videoPath
      } finally {
        await browser.close()
      }
    }
    return { browser, context, page, telemetry, runDirectory, close }
  } catch (error) {
    await context?.close().catch(() => undefined)
    await browser.close().catch(() => undefined)
    throw error
  }
}

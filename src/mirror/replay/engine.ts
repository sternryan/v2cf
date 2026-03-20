import { chromium } from 'playwright';
import type { Page } from 'playwright';
import type { ReplayOptions, ReplayResult, ApiCapture } from '../types.js';
import { readSession } from '../capture/session-store.js';
import { injectCachedResponses } from './response-injector.js';
import { mapRrwebEventToAction } from './event-mapper.js';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Replays a captured session against a target URL using Playwright.
 *
 * Flow:
 * 1. Load session from disk
 * 2. Launch headless Chromium with session viewport/userAgent
 * 3. Inject cached LLM responses via page.route()
 * 4. Navigate to target URL + pathname from session sourceUrl
 * 5. Replay each rrweb event as a Playwright action
 * 6. Take a final full-page screenshot
 * 7. Return ReplayResult with screenshots, apiResponses, errors, duration
 */
export async function runReplay(options: ReplayOptions): Promise<ReplayResult> {
  // 1. Load session
  const session = readSession(options.projectDir, options.sessionId);

  // 2. Determine viewport (options override, fall back to session metadata)
  const viewport = options.viewport ?? session.metadata.viewport;

  // 3. Launch browser
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport,
    userAgent: session.metadata.userAgent,
  });
  const page = await context.newPage();

  // 4. Set up LLM response injection BEFORE navigation
  await injectCachedResponses(page, session, {
    interceptPatterns: options.interceptPatterns,
  });

  // 5. Set up API response capture for non-LLM endpoints
  const apiResponses: ApiCapture[] = [];
  page.on('response', async (response) => {
    const url = response.url();
    const isIntercepted = options.interceptPatterns.some((p) =>
      url.includes(p)
    );
    if (!isIntercepted) {
      try {
        apiResponses.push({
          url,
          method: response.request().method(),
          status: response.status(),
          body: await response.text().catch(() => ''),
          headers: response.headers(),
          timestamp: Date.now(),
        });
      } catch {
        // Ignore failed response reads
      }
    }
  });

  // 6. Initialize tracking
  const errors: string[] = [];
  const screenshots: string[] = [];
  const startTime = Date.now();

  // 7. Ensure screenshot directory exists
  fs.mkdirSync(options.screenshotDir, { recursive: true });

  // 8. Navigate to target URL + pathname from session sourceUrl
  const startPath = new URL(session.sourceUrl).pathname;
  await page.goto(options.targetUrl + startPath, {
    waitUntil: 'networkidle',
  });

  // 9. Replay each rrweb event as a Playwright action
  for (const event of session.rrwebEvents) {
    const action = mapRrwebEventToAction(event);
    if (action) {
      try {
        await action.execute(page);
        await page.waitForTimeout(options.actionDelay);
      } catch (err) {
        errors.push(
          `Action failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  // 10. Take final full-page screenshot
  const screenshotPath = path.join(options.screenshotDir, 'replay-final.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  screenshots.push(screenshotPath);

  // 11. Close browser
  await browser.close();

  // 12. Return result
  return {
    screenshots,
    apiResponses,
    errors,
    duration: Date.now() - startTime,
  };
}

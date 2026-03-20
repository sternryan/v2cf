import type { Page, Route } from 'playwright';
import type { CaptureSession } from '../capture/types.js';

/**
 * Sets up Playwright page.route() interception to fulfill LLM API requests
 * with cached responses from a recorded session.
 *
 * Uses sequential index matching: the Nth intercepted request maps to the
 * Nth cached LLM response from the session's networkEvents.
 *
 * Non-LLM requests (those not matching interceptPatterns) pass through
 * via route.continue().
 */
export async function injectCachedResponses(
  page: Page,
  session: CaptureSession,
  options: { interceptPatterns: string[] }
): Promise<void> {
  // Filter to only LLM endpoint events whose URL matches an intercept pattern
  const llmEvents = session.networkEvents.filter(
    (e) =>
      e.isLlmEndpoint &&
      options.interceptPatterns.some((p) => e.url.includes(p))
  );

  let callIndex = 0;

  await page.route(
    (url: URL) =>
      options.interceptPatterns.some((p) => url.toString().includes(p)),
    async (route: Route) => {
      const cached = llmEvents[callIndex];

      if (!cached) {
        // No more cached responses for this pattern
        console.warn(
          `[v2cf replay] No cached response for LLM call #${callIndex + 1}`
        );
        await route.continue();
        return;
      }

      callIndex++;

      // route.fulfill() delivers the entire body at once (no streaming).
      // This is fine because the AI SDK's useChat parses the data stream
      // protocol identically whether data arrives chunked or all at once.
      await route.fulfill({
        status: cached.status,
        headers: {
          'content-type':
            cached.responseHeaders['content-type'] || 'text/plain',
          'x-v2cf-replay': 'true',
        },
        body: cached.responseBody,
      });
    }
  );
}

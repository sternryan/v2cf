import type { Page } from 'playwright';

/**
 * A Playwright-executable action derived from an rrweb event.
 */
export interface PlaywrightAction {
  type: 'click' | 'fill' | 'navigate';
  description: string;
  execute(page: Page): Promise<void>;
}

// rrweb event type constants
const RRWEB_INCREMENTAL = 3;

// rrweb IncrementalSnapshot source constants
const SOURCE_MOUSE_INTERACTION = 2;
const SOURCE_INPUT = 5;

// rrweb MouseInteraction type constants
const MOUSE_CLICK = 2;
const MOUSE_TOUCHSTART = 7;

/**
 * Maps an rrweb event to an executable Playwright action.
 *
 * Returns null for non-actionable events (full snapshots, mutations, scroll, etc.).
 * Only IncrementalSnapshot events with click or input source produce actions.
 */
export function mapRrwebEventToAction(event: any): PlaywrightAction | null {
  // Only IncrementalSnapshot events (type 3) are actionable
  if (event.type !== RRWEB_INCREMENTAL) {
    return null;
  }

  const { data } = event;

  // MouseInteraction: only click (2) and touchstart (7) produce actions
  if (data.source === SOURCE_MOUSE_INTERACTION) {
    if (data.type === MOUSE_CLICK || data.type === MOUSE_TOUCHSTART) {
      const x: number = data.x;
      const y: number = data.y;
      return {
        type: 'click',
        description: `click at (${x}, ${y})`,
        async execute(page: Page): Promise<void> {
          await page.mouse.click(x, y);
        },
      };
    }
    // mouseup, mousedown, etc. -- not actionable
    return null;
  }

  // Input: type text into the focused element
  if (data.source === SOURCE_INPUT) {
    const text: string = data.text ?? '';
    // NOTE: rrweb node IDs (data.id) reference the recording DOM, which won't
    // exist on the Cloudflare mirror. For v1, use keyboard.type() which types
    // into the currently focused element. Selector-based input mapping using
    // data-testid or rrweb node path is a v2 enhancement.
    return {
      type: 'fill',
      description: `fill "${text}"`,
      async execute(page: Page): Promise<void> {
        await page.keyboard.type(text);
      },
    };
  }

  // All other sources (mutation, scroll, media, etc.) are not actionable
  return null;
}

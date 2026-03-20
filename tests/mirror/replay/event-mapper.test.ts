import { describe, it, expect, vi } from 'vitest';
import { mapRrwebEventToAction, type PlaywrightAction } from '../../../src/mirror/replay/event-mapper.js';

// Sample rrweb events derived from tests/fixtures/sessions/sample-session.json
const clickEvent = {
  type: 3, // IncrementalSnapshot
  data: {
    source: 2, // MouseInteraction
    type: 2, // click
    id: 42,
    x: 512,
    y: 384,
    pointerType: 0,
  },
  timestamp: 1710864001500,
};

const touchstartEvent = {
  type: 3,
  data: {
    source: 2, // MouseInteraction
    type: 7, // touchstart
    id: 43,
    x: 100,
    y: 200,
    pointerType: 1,
  },
  timestamp: 1710864001600,
};

const inputEvent = {
  type: 3, // IncrementalSnapshot
  data: {
    source: 5, // Input
    id: 55,
    text: 'Hello, can you help me?',
    isChecked: false,
  },
  timestamp: 1710864002000,
};

const fullSnapshotEvent = {
  type: 2, // FullSnapshot
  data: {
    node: { type: 0, childNodes: [] },
    initialOffset: { top: 0, left: 0 },
  },
  timestamp: 1710864000100,
};

const mutationEvent = {
  type: 3, // IncrementalSnapshot
  data: {
    source: 0, // Mutation
    texts: [],
    attributes: [],
    removes: [],
    adds: [],
  },
  timestamp: 1710864001000,
};

const mouseUpEvent = {
  type: 3,
  data: {
    source: 2, // MouseInteraction
    type: 0, // mouseup (not click)
    id: 42,
    x: 512,
    y: 384,
    pointerType: 0,
  },
  timestamp: 1710864001400,
};

const mouseDownEvent = {
  type: 3,
  data: {
    source: 2, // MouseInteraction
    type: 1, // mousedown (not click)
    id: 42,
    x: 512,
    y: 384,
    pointerType: 0,
  },
  timestamp: 1710864001350,
};

const scrollEvent = {
  type: 3,
  data: {
    source: 3, // Scroll
    id: 1,
    x: 0,
    y: 200,
  },
  timestamp: 1710864002500,
};

describe('mapRrwebEventToAction', () => {
  describe('click events', () => {
    it('maps click event to PlaywrightAction with type "click" and coordinates', () => {
      const action = mapRrwebEventToAction(clickEvent);
      expect(action).not.toBeNull();
      expect(action!.type).toBe('click');
      expect(action!.description).toContain('512');
      expect(action!.description).toContain('384');
    });

    it('maps touchstart event to click action', () => {
      const action = mapRrwebEventToAction(touchstartEvent);
      expect(action).not.toBeNull();
      expect(action!.type).toBe('click');
      expect(action!.description).toContain('100');
      expect(action!.description).toContain('200');
    });

    it('executes click action by calling page.mouse.click(x, y)', async () => {
      const action = mapRrwebEventToAction(clickEvent)!;
      const mockPage = {
        mouse: { click: vi.fn().mockResolvedValue(undefined) },
      };
      await action.execute(mockPage as any);
      expect(mockPage.mouse.click).toHaveBeenCalledWith(512, 384);
    });
  });

  describe('input events', () => {
    it('maps input event to PlaywrightAction with type "fill" and text', () => {
      const action = mapRrwebEventToAction(inputEvent);
      expect(action).not.toBeNull();
      expect(action!.type).toBe('fill');
      expect(action!.description).toContain('Hello, can you help me?');
    });

    it('executes fill action using keyboard.type for coordinate-based input', async () => {
      const action = mapRrwebEventToAction(inputEvent)!;
      const mockPage = {
        keyboard: { type: vi.fn().mockResolvedValue(undefined) },
      };
      await action.execute(mockPage as any);
      expect(mockPage.keyboard.type).toHaveBeenCalledWith('Hello, can you help me?');
    });
  });

  describe('non-actionable events', () => {
    it('returns null for FullSnapshot events (type 2)', () => {
      const action = mapRrwebEventToAction(fullSnapshotEvent);
      expect(action).toBeNull();
    });

    it('returns null for mutation events (source 0)', () => {
      const action = mapRrwebEventToAction(mutationEvent);
      expect(action).toBeNull();
    });

    it('returns null for mouseup events (not click)', () => {
      const action = mapRrwebEventToAction(mouseUpEvent);
      expect(action).toBeNull();
    });

    it('returns null for mousedown events (not click)', () => {
      const action = mapRrwebEventToAction(mouseDownEvent);
      expect(action).toBeNull();
    });

    it('returns null for scroll events (source 3)', () => {
      const action = mapRrwebEventToAction(scrollEvent);
      expect(action).toBeNull();
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  MINIMIZED_HEIGHT, MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH, WINDOW_MARGIN, arrowDelta, clampRect, defaultRect, parsePrefs, serializePrefs,
} from './sources-window';

const view = { width: 1440, height: 900 };

describe('sources window geometry', () => {
  it('opens at the right side, inside the viewport', () => {
    const rect = defaultRect(view);

    expect(rect.x + rect.width).toBeLessThanOrEqual(view.width - WINDOW_MARGIN);
    expect(rect.y).toBeGreaterThanOrEqual(WINDOW_MARGIN);
    expect(rect.width).toBeGreaterThanOrEqual(MIN_WINDOW_WIDTH);
  });

  it('pulls a window remembered on a bigger screen back inside a small one', () => {
    const rect = clampRect({ x: 1800, y: 1200, width: 2000, height: 1600 }, { width: 390, height: 700 }, false);

    expect(rect.x).toBeGreaterThanOrEqual(WINDOW_MARGIN);
    expect(rect.x + rect.width).toBeLessThanOrEqual(390 - WINDOW_MARGIN);
    expect(rect.y + rect.height).toBeLessThanOrEqual(700 - WINDOW_MARGIN);
  });

  it('keeps the minimum size and lets a minimized window sit lower (only the header shows)', () => {
    const small = clampRect({ x: 10, y: 10, width: 50, height: 50 }, view, false);

    expect(small.width).toBe(MIN_WINDOW_WIDTH);
    expect(small.height).toBe(MIN_WINDOW_HEIGHT);

    const low = clampRect({ x: 10, y: 5000, width: 300, height: 500 }, view, true);

    expect(low.y).toBe(view.height - MINIMIZED_HEIGHT - WINDOW_MARGIN);
  });

  it('round-trips remembered prefs and rejects broken data', () => {
    const prefs = { rect: { x: 10, y: 20, width: 300, height: 400 }, minimized: true };

    expect(parsePrefs(serializePrefs(prefs))).toEqual(prefs);
    expect(parsePrefs('{"x":"a","y":1,"width":2,"height":3}')).toBeNull();
    expect(parsePrefs('not json')).toBeNull();
    expect(parsePrefs(null)).toBeNull();
  });

  it('maps arrow keys to moves (Shift = bigger steps)', () => {
    expect(arrowDelta('ArrowLeft', false)).toEqual({ dx: -16, dy: 0 });
    expect(arrowDelta('ArrowDown', true)).toEqual({ dx: 0, dy: 64 });
    expect(arrowDelta('Enter', false)).toBeNull();
  });
});

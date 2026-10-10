import { describe, expect, it } from 'vitest';
import { fitHeight, placePopup, POPUP_MAX_HEIGHT, POPUP_MIN_HEIGHT } from '../src/main/placement';

const SCREEN = { x: 0, y: 0, width: 1920, height: 1080 };
const SIZE = { width: 420, height: 300 };

describe('placePopup', () => {
  it('goes right of the cursor, level with it', () => {
    expect(placePopup({ x: 100, y: 100 }, SIZE, SCREEN)).toEqual({ x: 124, y: 100 });
  });

  it('goes left of the cursor near the right edge', () => {
    expect(placePopup({ x: 1800, y: 100 }, SIZE, SCREEN)).toEqual({ x: 1356, y: 100 });
  });

  it('moves up to stay on the screen', () => {
    expect(placePopup({ x: 100, y: 1000 }, SIZE, SCREEN)).toEqual({ x: 124, y: 780 });
  });

  it('works on a screen left of the main one', () => {
    expect(placePopup({ x: -100, y: 50 }, SIZE, { x: -1920, y: 0, width: 1920, height: 1080 })).toEqual({ x: -544, y: 50 });
  });

  it('keeps its top on the screen when it is taller than the screen', () => {
    expect(placePopup({ x: 100, y: 100 }, { width: 420, height: 2000 }, SCREEN).y).toBe(0);
  });

  it('rounds to whole pixels', () => {
    expect(placePopup({ x: 100.6, y: 200.4 }, SIZE, SCREEN)).toEqual({ x: 125, y: 200 });
  });
});

describe('fitHeight', () => {
  it('fits the content, within limits, in whole pixels', () => {
    expect(fitHeight(300.4, POPUP_MIN_HEIGHT, false)).toBe(300);
    expect(fitHeight(20, 300, false)).toBe(POPUP_MIN_HEIGHT);
    expect(fitHeight(5000, 300, false)).toBe(POPUP_MAX_HEIGHT);
  });

  it('shrinks to a shorter page', () => {
    expect(fitHeight(150, 400, false)).toBe(150);
  });

  it('keeps its size while a clicked page loads, so it does not jump, but may grow', () => {
    expect(fitHeight(120, 400, true)).toBe(400);
    expect(fitHeight(500, 400, true)).toBe(500);
  });

  it.each([['text', 'x'], ['NaN', Number.NaN], ['infinity', Number.POSITIVE_INFINITY], ['nothing', undefined]])('ignores %s', (_, reported) => {
    expect(fitHeight(reported, 300, false)).toBeNull();
  });
});

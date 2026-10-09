import { describe, expect, it } from 'vitest';
import { placePopup } from '../src/main/placement';

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

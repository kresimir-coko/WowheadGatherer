export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Point, Size {}

/** Space between the cursor and the popup, in pixels. */
export const CURSOR_GAP = 24;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

/** Where the popup goes: right of the cursor, or left of it when that runs off the screen, level with it, and kept on the screen. */
export function placePopup(cursor: Point, size: Size, area: Rect): Point {
  let x = cursor.x + CURSOR_GAP;
  if (x + size.width > area.x + area.width) x = cursor.x - CURSOR_GAP - size.width;
  x = clamp(x, area.x, area.x + area.width - size.width);
  const y = clamp(cursor.y, area.y, area.y + area.height - size.height);
  return { x: Math.round(x), y: Math.round(y) };
}

/** A position moved just enough for a window of size to stay on the screen. */
export function keepOnScreen(position: Point, size: Size, area: Rect): Point {
  return {
    x: Math.round(clamp(position.x, area.x, area.x + area.width - size.width)),
    y: Math.round(clamp(position.y, area.y, area.y + area.height - size.height)),
  };
}

/** The popup's width, and the range its height fits its content within, in pixels. */
export const POPUP_WIDTH = 420;
export const POPUP_MIN_HEIGHT = 64;
export const POPUP_MAX_HEIGHT = 560;

/**
 * The window height for the content's reported height, kept within limits, or null for a
 * report that isn't a number. While held (a page clicked inside the popup is loading) it
 * doesn't shrink, so the popup doesn't drop down the screen and then grow back.
 */
export function fitHeight(reported: unknown, current: number, hold: boolean): number | null {
  if (typeof reported !== 'number' || !Number.isFinite(reported)) return null;
  const height = Math.round(Math.min(Math.max(reported, POPUP_MIN_HEIGHT), POPUP_MAX_HEIGHT));
  return hold ? Math.max(height, current) : height;
}

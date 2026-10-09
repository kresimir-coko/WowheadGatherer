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

/** The tray icon's width and height, in pixels. */
export const TRAY_ICON_SIZE = 32;
/** Wowhead red and a gold rim, as blue, green, red, alpha bytes (the order Electron bitmaps use on Windows). */
const FILL = [0x1f, 0x1f, 0xb3, 0xff];
const RIM = [0x00, 0xd1, 0xff, 0xff];
/** The rim's width, in pixels. */
const RIM_WIDTH = 2.5;

/** A red disc with a gold rim, for nativeImage.createFromBitmap. */
export function trayIconPixels(size = TRAY_ICON_SIZE): Buffer {
  const pixels = Buffer.alloc(size * size * 4);
  const centre = (size - 1) / 2;
  const radius = size / 2 - 0.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x - centre, y - centre);
      if (distance > radius) continue;
      pixels.set(distance > radius - RIM_WIDTH ? RIM : FILL, (y * size + x) * 4);
    }
  }
  return pixels;
}

import { describe, expect, it } from 'vitest';
import { latestOnly } from '../src/main/latestOnly';
import { TRAY_ICON_SIZE, trayIconPixels } from '../src/main/trayIcon';
import { browserUserAgent } from '../src/main/userAgent';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.97 Safari/537.36';

describe('browserUserAgent', () => {
  it.each([
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) wowhead-gatherer/0.1.0 Chrome/138.0.7204.97 Electron/37.2.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Wowhead Gatherer/0.1.0 Chrome/138.0.7204.97 Electron/37.2.0 Safari/537.36',
  ])('makes Electron look like plain Chrome: %s', (agent) => {
    expect(browserUserAgent(agent)).toBe(CHROME);
  });

  it('leaves plain Chrome alone', () => {
    expect(browserUserAgent(CHROME)).toBe(CHROME);
  });
});

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('latestOnly', () => {
  it("drops an older lookup's late answer", async () => {
    const pending = new Map<string, Deferred<string>>();
    const delivered: string[] = [];
    const lookUp = latestOnly((name: string) => {
      const d = deferred<string>();
      pending.set(name, d);
      return d.promise;
    }, (result) => delivered.push(result));
    lookUp('A');
    lookUp('B');
    pending.get('B')?.resolve('B done');
    pending.get('A')?.resolve('A done');
    await settle();
    expect(delivered).toEqual(['B done']);
  });

  it('delivers every answer when lookups do not overlap', async () => {
    const delivered: string[] = [];
    const lookUp = latestOnly(async (name: string) => `${name} done`, (result) => delivered.push(result));
    lookUp('A');
    await settle();
    lookUp('B');
    await settle();
    expect(delivered).toEqual(['A done', 'B done']);
  });
});

describe('trayIconPixels', () => {
  const pixels = trayIconPixels();
  const at = (x: number, y: number) => [...pixels.subarray((y * TRAY_ICON_SIZE + x) * 4, (y * TRAY_ICON_SIZE + x) * 4 + 4)];

  it('is a square of blue, green, red, alpha bytes', () => {
    expect(pixels.length).toBe(TRAY_ICON_SIZE * TRAY_ICON_SIZE * 4);
  });

  it('is a disc: clear corners, solid middle', () => {
    expect(at(0, 0)[3]).toBe(0);
    expect(at(16, 16)).toEqual([0x1f, 0x1f, 0xb3, 0xff]);
  });
});

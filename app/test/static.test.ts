import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const STATIC = new URL('../static/', import.meta.url);
const read = (name: string) => readFileSync(new URL(name, STATIC), 'utf8');

describe('popup page', () => {
  it('may load its own fonts, and nothing else new', () => {
    const policy = /content="([^"]+)"/.exec(read('popup.html'))?.[1] ?? '';
    expect(policy.split(';').map((part) => part.trim())).toEqual([
      "default-src 'none'", "script-src 'self'", "style-src 'self'", 'img-src https://wow.zamimg.com', "font-src 'self'",
    ]);
  });

  it('bundles every font its stylesheet asks for, with the licence', () => {
    const fonts = [...read('popup.css').matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((match) => match[1]);
    expect(fonts).toEqual(['fonts/Marcellus-Regular.ttf']);
    for (const font of fonts) expect(existsSync(new URL(font, STATIC))).toBe(true);
    expect(existsSync(new URL('fonts/OFL.txt', STATIC))).toBe(true);
  });

  it('makes the top bar sticky and draggable, and its controls clickable', () => {
    const css = read('popup.css');
    const rule = (selector: string) => new RegExp(`(^|\\n)${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(css)?.[2] ?? '';
    expect(rule('.top')).toMatch(/position:\s*sticky/);
    expect(rule('.top')).toMatch(/-webkit-app-region:\s*drag/);
    expect(rule('.top button')).toMatch(/-webkit-app-region:\s*no-drag/);
  });
});

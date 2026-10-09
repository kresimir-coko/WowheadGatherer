import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DiskCache } from '../src/main/cache';

const tempDir = () => mkdtempSync(path.join(tmpdir(), 'whg-cache-'));

describe('DiskCache', () => {
  it('gives back what it saved', () => {
    const cache = new DiskCache(tempDir());
    cache.set('a', { x: 1 }, 1000);
    expect(cache.get('a', 60_000, 2000)).toEqual({ x: 1 });
  });

  it('forgets entries older than asked', () => {
    const cache = new DiskCache(tempDir());
    cache.set('a', 1, 0);
    expect(cache.get('a', 1000, 1001)).toBeUndefined();
  });

  it('forgets entries saved in the future (the clock was changed)', () => {
    const cache = new DiskCache(tempDir());
    cache.set('a', 1, 5000);
    expect(cache.get('a', 1000, 0)).toBeUndefined();
  });

  it('has nothing for keys it never saw', () => {
    expect(new DiskCache(tempDir()).get('nope', 1000, 0)).toBeUndefined();
  });

  it('ignores a damaged file', () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, 'a.json'), '{not json');
    expect(new DiskCache(dir).get('a', 1000, 0)).toBeUndefined();
  });

  it('keeps every key inside its folder', () => {
    const dir = tempDir();
    new DiskCache(dir).set('../../evil', 1, 0);
    expect(readdirSync(dir)).toEqual(['______evil.json']);
  });

  it('does not fail when it cannot save', () => {
    const file = path.join(tempDir(), 'a-file');
    writeFileSync(file, '');
    expect(() => new DiskCache(file).set('a', 1, 0)).not.toThrow();
  });
});

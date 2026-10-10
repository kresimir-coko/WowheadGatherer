import { describe, expect, it, vi } from 'vitest';
import { ClipboardWatcher } from '../src/main/clipboardWatcher';
import type { WowheadLink } from '../src/shared/wowheadLink';

const LINK = 'https://www.wowhead.com/tbc/item=19019';

function setup(start: { exe?: string; text?: string } = {}) {
  const state = { sequence: 1, exe: start.exe ?? 'WowClassic.exe', text: start.text ?? '' };
  const links: WowheadLink[] = [];
  const fronts: boolean[] = [];
  const watcher = new ClipboardWatcher({
    clipboardSequence: () => state.sequence,
    foregroundExeName: () => state.exe,
    readClipboardText: () => state.text,
    onLink: (link) => links.push(link),
    onForeground: (gameInFront) => fronts.push(gameInFront),
  });
  const copy = (text: string) => {
    state.text = text;
    state.sequence++;
  };
  return { state, links, fronts, watcher, copy };
}

describe('ClipboardWatcher', () => {
  it('looks up a link copied in the game', () => {
    const t = setup();
    t.copy(LINK);
    t.watcher.tick();
    expect(t.links.map((link) => link.id)).toEqual([19019]);
  });

  it('does nothing while the clipboard stays the same', () => {
    const t = setup();
    t.watcher.tick();
    t.watcher.tick();
    expect(t.links).toEqual([]);
  });

  it('ignores links copied in other programs, even after switching back', () => {
    const t = setup({ exe: 'chrome.exe' });
    t.copy(LINK);
    t.watcher.tick();
    t.state.exe = 'WowClassic.exe';
    t.watcher.tick();
    expect(t.links).toEqual([]);
  });

  it('ignores other text copied in the game', () => {
    const t = setup();
    t.copy('hello');
    t.watcher.tick();
    expect(t.links).toEqual([]);
  });

  it('ignores a link already on the clipboard when it starts', () => {
    const t = setup({ text: LINK });
    t.watcher.tick();
    expect(t.links).toEqual([]);
  });

  it('looks up the same link each time it is copied', () => {
    const t = setup();
    t.copy(LINK);
    t.watcher.tick();
    t.copy(LINK);
    t.watcher.tick();
    expect(t.links).toHaveLength(2);
  });

  it('knows the game whatever the letter case', () => {
    const t = setup({ exe: 'WOWCLASSIC.EXE' });
    t.copy(LINK);
    t.watcher.tick();
    expect(t.links).toHaveLength(1);
  });

  it('reports whether the game is in front', () => {
    const t = setup();
    t.watcher.tick();
    t.state.exe = 'chrome.exe';
    t.watcher.tick();
    expect(t.fronts).toEqual([true, false]);
  });

  it('ignores a huge or empty clipboard (an image, a big log)', () => {
    const t = setup();
    t.copy('');
    t.watcher.tick();
    t.copy('x'.repeat(5_000_000));
    t.watcher.tick();
    expect(t.links).toEqual([]);
  });

  it("reads a clipboard that answers later (Electron's clipboard is async)", async () => {
    const links: WowheadLink[] = [];
    let sequence = 1;
    const watcher = new ClipboardWatcher({
      clipboardSequence: () => sequence,
      foregroundExeName: () => 'WowClassic.exe',
      readClipboardText: async () => LINK,
      onLink: (link) => links.push(link),
    });
    sequence++;
    watcher.tick();
    await new Promise((r) => setTimeout(r, 0));
    expect(links.map((link) => link.id)).toEqual([19019]);
  });

  it('ignores a clipboard read that fails (another program holds it)', async () => {
    const links: WowheadLink[] = [];
    let sequence = 1;
    const watcher = new ClipboardWatcher({
      clipboardSequence: () => sequence,
      foregroundExeName: () => 'WowClassic.exe',
      readClipboardText: () => Promise.reject(new Error('clipboard busy')),
      onLink: (link) => links.push(link),
    });
    sequence++;
    watcher.tick();
    await new Promise((r) => setTimeout(r, 0));
    expect(links).toEqual([]);
  });

  it('checks on a timer once started', () => {
    vi.useFakeTimers();
    try {
      const t = setup();
      t.watcher.start(100);
      t.copy(LINK);
      vi.advanceTimersByTime(100);
      t.watcher.stop();
      expect(t.links).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

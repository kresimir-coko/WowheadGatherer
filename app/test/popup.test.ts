// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contentHeight, renderState, type PopupActions } from '../src/renderer/popup';
import type { ItemInfo, PopupState } from '../src/shared/types';
import { parseWowheadLink } from '../src/shared/wowheadLink';

const link = parseWowheadLink('https://www.wowhead.com/tbc/item=28773')!;
const info: ItemInfo = {
  name: 'Gorehowl',
  quality: 4,
  icon: 'inv_axe_60',
  commentTotal: 90,
  sections: [{ title: 'Dropped by', total: 200, rows: [{ name: 'Prince Malchezaar', details: ['Karazhan', '18%'] }] }],
  comments: [{
    user: '', rating: 300, date: 'Feb 2007',
    body: [{ kind: 'bold', children: [{ kind: 'text', text: 'Grom' }] }, { kind: 'text', text: "'s axe" }],
  }],
};

let root: HTMLElement;
let actions: PopupActions;
beforeEach(() => {
  root = document.createElement('main');
  actions = { close: vi.fn(), openWowhead: vi.fn() };
});
const show = (state: PopupState) => renderState(root, state, actions);
const text = (selector: string) => root.querySelector(selector)?.textContent;

describe('renderState', () => {
  it('shows the item number while it loads', () => {
    show({ kind: 'loading', link });
    expect(text('h1')).toBe('Item 28773');
    expect(text('.status')).toBe('Looking it up on Wowhead…');
  });

  it('shows the name in its quality colour, with its icon', () => {
    show({ kind: 'ready', link, info });
    expect(text('h1')).toBe('Gorehowl');
    expect(root.querySelector('h1')?.className).toBe('q4');
    expect(root.querySelector('img')?.getAttribute('src')).toBe('https://wow.zamimg.com/images/wow/icons/large/inv_axe_60.jpg');
  });

  it('lists the sources, and how many more Wowhead has', () => {
    show({ kind: 'ready', link, info });
    expect(text('section h2')).toBe('Dropped by');
    expect(text('li .name')).toBe('Prince Malchezaar');
    expect(text('li .details')).toBe('Karazhan · 18%');
    expect(text('li.more')).toBe('+199 more on Wowhead');
  });

  it('shows the comments with their markup', () => {
    show({ kind: 'ready', link, info });
    expect(text('.comments h2')).toBe('Comments (90)');
    expect(text('.comment .meta')).toBe('★ 300 · Feb 2007');
    expect(text('.comment .body strong')).toBe('Grom');
    expect(text('.comment .body')).toBe("Grom's axe");
  });

  it('never turns Wowhead text into HTML', () => {
    const evil = '<img src=x onerror=alert(1)><script>alert(1)</script>';
    show({
      kind: 'ready', link,
      info: { ...info, sections: [{ title: 'Dropped by', total: 1, rows: [{ name: evil, details: [] }] }],
        comments: [{ user: evil, rating: 1, date: '', body: [{ kind: 'text', text: evil }] }] },
    });
    expect(root.querySelectorAll('img')).toHaveLength(1); // just the item's icon
    expect(root.querySelector('script')).toBeNull();
    expect(text('li .name')).toBe(evil);
  });

  it("shows the error, with the tooltip service's name when there is one", () => {
    show({ kind: 'error', link, message: 'Blocked.', header: { name: 'Gorehowl', quality: 4, icon: 'inv_axe_60' } });
    expect(text('h1')).toBe('Gorehowl');
    expect(text('.status.error')).toBe('Blocked.');
  });

  it('shows the item number when the error has no name', () => {
    show({ kind: 'error', link, message: 'Offline.', header: null });
    expect(text('h1')).toBe('Item 28773');
    expect(root.querySelector('img')).toBeNull();
  });

  it('does not load icons with odd names', () => {
    show({ kind: 'ready', link, info: { ...info, icon: '../../evil' } });
    expect(root.querySelector('img')).toBeNull();
  });

  it('keeps the quality colour in range', () => {
    show({ kind: 'ready', link, info: { ...info, quality: 99 } });
    expect(root.querySelector('h1')?.className).toBe('q7');
  });

  it('says so when Wowhead has nothing to list', () => {
    show({ kind: 'ready', link, info: { ...info, sections: [], comments: [], commentTotal: 0 } });
    expect(text('.status')).toBe('Wowhead lists no sources or comments for this item.');
  });

  it('wires up the buttons', () => {
    show({ kind: 'ready', link, info });
    root.querySelector<HTMLButtonElement>('.open')?.click();
    root.querySelector<HTMLButtonElement>('.close')?.click();
    expect(actions.openWowhead).toHaveBeenCalledOnce();
    expect(actions.close).toHaveBeenCalledOnce();
  });
});

describe('contentHeight', () => {
  function box(scrollHeight: number, offsetHeight: number, clientHeight: number): HTMLElement {
    const element = document.createElement('main');
    Object.defineProperty(element, 'scrollHeight', { value: scrollHeight });
    Object.defineProperty(element, 'offsetHeight', { value: offsetHeight });
    Object.defineProperty(element, 'clientHeight', { value: clientHeight });
    return element;
  }

  it("counts the frame's border, so content that fits shows no scrollbar", () => {
    // 300 px of content inside a 1 px border top and bottom.
    expect(contentHeight(box(300, 302, 300))).toBe(302);
  });

  it('asks for all of its content while the window is still too short', () => {
    // A 96 px window holding 500 px of content.
    expect(contentHeight(box(500, 96, 94))).toBe(502);
  });
});

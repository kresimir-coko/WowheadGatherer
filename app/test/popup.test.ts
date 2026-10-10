// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contentHeight, renderState, type PopupActions } from '../src/renderer/popup';
import type { ItemInfo, PopupState, QuestInfo } from '../src/shared/types';
import { parseWowheadLink } from '../src/shared/wowheadLink';

const link = parseWowheadLink('https://www.wowhead.com/tbc/item=28773')!;
const info: ItemInfo = {
  kind: 'item',
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
    show({ kind: 'error', link, message: 'Blocked.', header: { kind: 'item', name: 'Gorehowl', quality: 4, icon: 'inv_axe_60' } });
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

const questLink = parseWowheadLink('https://www.wowhead.com/tbc/quest=10482')!;
const quest: QuestInfo = {
  kind: 'quest', name: 'Fel Orc Scavengers', quality: 1, icon: 'inv_misc_note_01', commentTotal: 21,
  chain: [
    { position: 1, quests: [{ name: 'Know your Enemy', current: false }] },
    { position: 2, quests: [{ name: 'Fel Orc Scavengers', current: true }] },
    { position: 3, quests: [{ name: 'Ill Omens', current: false }, { name: 'Shields', current: false }] },
  ],
  comments: [{ user: 'Lustral', rating: 12, date: 'Jan 2008', body: [{ kind: 'text', text: 'North of Honor Hold.' }] }],
};
const all = (selector: string) => [...root.querySelectorAll(selector)].map((node) => node.textContent);

describe('renderState for quests', () => {
  it('shows the quest name in gold, with the quest icon', () => {
    show({ kind: 'ready', link: questLink, info: quest });
    expect(text('h1')).toBe('Fel Orc Scavengers');
    expect(root.querySelector('h1')?.className).toBe('quest');
    expect(root.querySelector('img')?.getAttribute('src')).toBe('https://wow.zamimg.com/images/wow/icons/large/inv_misc_note_01.jpg');
  });

  it('lists the chain in order, marking the quest on show', () => {
    show({ kind: 'ready', link: questLink, info: quest });
    expect(text('.chain h2')).toBe('Quest chain');
    expect(all('.chain .position')).toEqual(['1.', '2.', '3.']);
    expect(all('.chain li .name')).toEqual(['Know your Enemy', 'Fel Orc Scavengers', 'Ill Omens or Shields']);
    expect(all('.chain .current')).toEqual(['Fel Orc Scavengers']);
    expect(text('.comments h2')).toBe('Comments (21)');
  });

  it('shows the quest number while a quest loads', () => {
    show({ kind: 'loading', link: questLink });
    expect(text('h1')).toBe('Quest 10482');
    expect(root.querySelector('h1')?.className).toBe('quest');
  });

  it('says so when Wowhead has no chain or comments for a quest', () => {
    show({ kind: 'ready', link: questLink, info: { ...quest, chain: [], comments: [], commentTotal: 0 } });
    expect(text('.status')).toBe('Wowhead lists no chain or comments for this quest.');
  });

  it('never turns quest names into HTML', () => {
    const evil = '<img src=x onerror=alert(1)>';
    show({ kind: 'ready', link: questLink, info: { ...quest, chain: [{ position: 1, quests: [{ name: evil, current: true }] }] } });
    expect(root.querySelectorAll('img')).toHaveLength(1); // just the quest icon
    expect(text('.chain .current')).toBe(evil);
  });
});

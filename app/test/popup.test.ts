// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contentHeight, refitWhenFontsLoad, renderState, type PopupActions } from '../src/renderer/popup';
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
  actions = { close: vi.fn(), openWowhead: vi.fn(), openQuest: vi.fn(), goBack: vi.fn(), resized: vi.fn(), openGuide: vi.fn(), setPinned: vi.fn() };
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
  kind: 'quest', name: 'Fel Orc Scavengers', quality: 1, icon: 'inv_misc_note_01', commentTotal: 21, guides: [],
  chain: [
    { position: 1, quests: [{ id: 10160, name: 'Know your Enemy', current: false }] },
    { position: 2, quests: [{ id: 10482, name: 'Fel Orc Scavengers', current: true }] },
    { position: 3, quests: [{ id: 10483, name: 'Ill Omens', current: false }, { id: 0, name: 'Shields', current: false }] },
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
    show({ kind: 'ready', link: questLink, info: { ...quest, chain: [{ position: 1, quests: [{ id: 10482, name: evil, current: true }] }] } });
    expect(root.querySelectorAll('img')).toHaveLength(1); // just the quest icon
    expect(text('.chain .current')).toBe(evil);
  });
});

const comments = (count: number) => Array.from({ length: count }, (_, i) => ({
  user: `u${i}`, rating: count - i, date: '', body: [{ kind: 'text' as const, text: `c${i}` }],
}));

describe('clicking through', () => {
  it('opens the other quests of the chain, not the one on show or one without an ID', () => {
    show({ kind: 'ready', link: questLink, info: quest });
    const links = [...root.querySelectorAll<HTMLButtonElement>('.chain button.quest-link')];
    expect(links.map((button) => button.textContent)).toEqual(['Know your Enemy', 'Ill Omens']);
    links[0].click();
    expect(actions.openQuest).toHaveBeenCalledWith(10160);
    expect(root.querySelector('.chain .current')?.tagName).toBe('SPAN');
  });

  it('opens the quests an item starts or is needed for, not its quest rewards', () => {
    const related: ItemInfo = { ...info, sections: [
      { title: 'Starts quest', total: 1, rows: [{ name: 'The Fall of Magtheridon', details: ['Level 70'], questId: 11002 }] },
      { title: 'Quest reward', total: 1, rows: [{ name: 'Some Quest', details: ['Level 60'] }] },
    ] };
    show({ kind: 'ready', link, info: related });
    const links = [...root.querySelectorAll<HTMLButtonElement>('section button.quest-link')];
    expect(links.map((button) => button.textContent)).toEqual(['The Fall of Magtheridon']);
    links[0].click();
    expect(actions.openQuest).toHaveBeenCalledWith(11002);
    expect(all('section li .name')).toEqual(['The Fall of Magtheridon', 'Some Quest']);
  });

  it('shows the breadcrumb and goes back from it', () => {
    show({ kind: 'ready', link: questLink, info: quest, trail: ["Duron's Report", 'Arrival in Outland'] });
    expect(all('.trail .crumb')).toEqual(["Duron's Report", 'Arrival in Outland']);
    expect(text('.trail .here')).toBe('Fel Orc Scavengers');
    root.querySelectorAll<HTMLButtonElement>('.trail .crumb')[1].click();
    expect(actions.goBack).toHaveBeenCalledWith(1);
    show({ kind: 'ready', link: questLink, info: quest });
    expect(root.querySelector('.trail')).toBeNull();
  });

  it('keeps the breadcrumb while the next quest loads', () => {
    show({ kind: 'loading', link: questLink, trail: ['Fel Orc Scavengers'] });
    expect(all('.trail .crumb')).toEqual(['Fel Orc Scavengers']);
    expect(text('.trail .here')).toBe('Quest 10482');
  });

  it('never turns breadcrumb names into HTML', () => {
    const evil = '<img src=x onerror=alert(1)>';
    show({ kind: 'loading', link: questLink, trail: [evil] });
    expect(root.querySelector('img')).toBeNull();
    expect(text('.trail .crumb')).toBe(evil);
  });

  it('starts each page at the top', () => {
    root.scrollTop = 120;
    show({ kind: 'loading', link: questLink });
    expect(root.scrollTop).toBe(0);
  });
});

describe('more comments', () => {
  it('shows the best 3, then 5 more per click, until all are shown', () => {
    show({ kind: 'ready', link, info: { ...info, comments: comments(12), commentTotal: 12 } });
    const more = () => root.querySelector<HTMLButtonElement>('.more-comments');
    expect(root.querySelectorAll('.comment')).toHaveLength(3);
    expect(more()?.textContent).toBe('Show 5 more comments');
    more()?.click();
    expect(root.querySelectorAll('.comment')).toHaveLength(8);
    expect(more()?.textContent).toBe('Show 4 more comments');
    more()?.click();
    expect(root.querySelectorAll('.comment')).toHaveLength(12);
    expect(more()).toBeNull();
    expect(actions.resized).toHaveBeenCalledTimes(2);
    expect(all('.comment .body')).toEqual(comments(12).map((c) => c.body[0].text));
  });

  it('says "1 more comment", and has no button for 3 or fewer', () => {
    show({ kind: 'ready', link, info: { ...info, comments: comments(4), commentTotal: 4 } });
    expect(text('.more-comments')).toBe('Show 1 more comment');
    show({ kind: 'ready', link, info: { ...info, comments: comments(3), commentTotal: 3 } });
    expect(root.querySelector('.more-comments')).toBeNull();
  });
});

describe('spells', () => {
  const spellLink = parseWowheadLink('https://www.wowhead.com/tbc/spell=27019')!;
  const spell = { kind: 'spell' as const, name: 'Arcane Shot', quality: 1, icon: 'ability_impalingbolt', comments: comments(4), commentTotal: 4 };

  it('shows a spell: its name in white, and its comments', () => {
    show({ kind: 'ready', link: spellLink, info: spell });
    expect(text('h1')).toBe('Arcane Shot');
    expect(root.querySelector('h1')?.className).toBe('q1');
    expect(root.querySelectorAll('.comment')).toHaveLength(3);
    expect(root.querySelector('.quest-link')).toBeNull();
  });

  it('says so when Wowhead has no comments for a spell', () => {
    show({ kind: 'ready', link: spellLink, info: { ...spell, comments: [], commentTotal: 0 } });
    expect(text('.status')).toBe('Wowhead lists no comments for this spell.');
  });
});

describe('long chains and guides', () => {
  const chainLink = parseWowheadLink('https://www.wowhead.com/tbc/quest=9836#chain=9824~Arcane%20Disturbances.9825~Restless%20Activity.9836~The%20Master%27s%20Touch.9837~Return%20to%20Khadgar')!;
  const master: QuestInfo = { ...quest, name: "The Master's Touch", chain: [] };

  it('shows the full chain from Questie, every other quest clickable', () => {
    show({ kind: 'ready', link: chainLink, info: master });
    expect(all('.chain .position')).toEqual(['1.', '2.', '3.', '4.']);
    expect(all('.chain .current')).toEqual(["The Master's Touch"]);
    const links = [...root.querySelectorAll<HTMLButtonElement>('.chain button.quest-link')];
    expect(links.map((button) => button.textContent)).toEqual(['Arcane Disturbances', 'Restless Activity', 'Return to Khadgar']);
    links[2].click();
    expect(actions.openQuest).toHaveBeenCalledWith(9837);
  });

  it('lists the guides and opens them', () => {
    const guides = [{ title: 'Attunements Guide', url: 'https://www.wowhead.com/tbc/guide/a' }, { title: 'Black Morass Guide', url: 'https://www.wowhead.com/tbc/guide/b' }];
    show({ kind: 'ready', link: questLink, info: { ...quest, guides } });
    expect(text('.guides h2')).toBe('Guides');
    expect(all('.guides .guide-link')).toEqual(['Attunements Guide', 'Black Morass Guide']);
    root.querySelectorAll<HTMLButtonElement>('.guides .guide-link')[1].click();
    expect(actions.openGuide).toHaveBeenCalledWith(1);
  });

  it('never turns chain or guide names into HTML', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const evilLink = parseWowheadLink(`https://www.wowhead.com/tbc/quest=9836#chain=1~${encodeURIComponent(evil)}.9836~Here`)!;
    show({ kind: 'ready', link: evilLink, info: { ...master, guides: [{ title: evil, url: 'https://www.wowhead.com/tbc/guide/a' }] } });
    expect(root.querySelectorAll('img')).toHaveLength(1); // just the quest icon
    expect(text('.chain button.quest-link')).toBe(evil);
    expect(text('.guides .guide-link')).toBe(evil);
  });
});

describe('the window', () => {
  it('keeps the breadcrumb and the title row in the sticky bar', () => {
    show({ kind: 'ready', link: questLink, info: quest, trail: ["Duron's Report"] });
    expect(root.querySelector('.top > .trail')).not.toBeNull();
    expect(root.querySelector('.top > header')).not.toBeNull();
  });

  it('pins and unpins', () => {
    show({ kind: 'ready', link, info });
    expect(text('.pin')).toBe('Pin');
    root.querySelector<HTMLButtonElement>('.pin')?.click();
    expect(actions.setPinned).toHaveBeenLastCalledWith(true);
    show({ kind: 'ready', link, info, pinned: true });
    expect(text('.pin')).toBe('Pinned');
    expect(root.querySelector('.pin')?.classList.contains('pinned')).toBe(true);
    root.querySelector<HTMLButtonElement>('.pin')?.click();
    expect(actions.setPinned).toHaveBeenLastCalledWith(false);
  });

  it('shows an error under the breadcrumb, which still goes back', () => {
    show({ kind: 'error', link: questLink, message: 'Blocked.', header: null, trail: ['Fel Orc Scavengers'] });
    expect(all('.trail .crumb')).toEqual(['Fel Orc Scavengers']);
    expect(text('.status.error')).toBe('Blocked.');
    root.querySelector<HTMLButtonElement>('.trail .crumb')?.click();
    expect(actions.goBack).toHaveBeenCalledWith(0);
  });

  it('never turns a clickable quest name into HTML', () => {
    const evil = '<img src=x onerror=alert(1)>';
    show({ kind: 'ready', link: questLink, info: { ...quest, chain: [
      { position: 1, quests: [{ id: 5, name: evil, current: false }] },
      { position: 2, quests: [{ id: 10482, name: 'Fel Orc Scavengers', current: true }] },
    ] } });
    expect(text('.chain button.quest-link')).toBe(evil);
    expect(root.querySelectorAll('img')).toHaveLength(1); // just the quest icon
  });

  it('re-fits once fonts are ready, and not without fonts', async () => {
    const resized = vi.fn();
    refitWhenFontsLoad({ ready: Promise.resolve() }, resized);
    refitWhenFontsLoad(undefined, resized);
    await Promise.resolve();
    await Promise.resolve();
    expect(resized).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it } from 'vitest';
import { clickableQuestIds, guideUrl, questLink, Trail } from '../src/main/trail';
import { pageName } from '../src/shared/pageName';
import type { ItemInfo, PopupState, QuestInfo } from '../src/shared/types';
import { parseWowheadLink, type WowheadLink } from '../src/shared/wowheadLink';

function link(url: string): WowheadLink {
  const parsed = parseWowheadLink(url);
  if (!parsed) throw new Error(url);
  return parsed;
}

const FEL_ORC = link('https://www.wowhead.com/tbc/de/quest=10482');
const DURONS_REPORT = link('https://www.wowhead.com/tbc/item=28105');
const felOrc: QuestInfo = {
  kind: 'quest', name: 'Plünderer der Höllenorcs', quality: 1, icon: 'inv_misc_note_01', comments: [], commentTotal: 0, guides: [], rewards: null,
  chain: [
    { position: 1, quests: [{ id: 10160, name: 'Den Feind kennen', current: false }] },
    { position: 2, quests: [{ id: 10482, name: 'Plünderer der Höllenorcs', current: true }] },
    { position: 3, quests: [{ id: 10483, name: 'Schwarze Magie', current: false }, { id: 0, name: 'Unlinked', current: false }] },
  ],
};
const duronsReport: ItemInfo = {
  kind: 'item', name: "Duron's Report", quality: 1, icon: 'inv_letter_04', comments: [], commentTotal: 0,
  sections: [
    { title: 'Needed for', total: 2, rows: [
      { name: 'Journey to Honor Hold', details: ['Level 61'], questId: 10140 },
      { name: 'Arrival in Outland', details: ['Level 61'], questId: 10288 },
    ] },
    { title: 'Quest reward', total: 1, rows: [{ name: 'Some Quest', details: [] }] },
  ],
};
const onFelOrc: PopupState = { kind: 'ready', link: FEL_ORC, info: felOrc };
const onReport: PopupState = { kind: 'ready', link: DURONS_REPORT, info: duronsReport };

describe('questLink', () => {
  it('keeps the game and language of the page it came from', () => {
    expect(questLink(FEL_ORC, 10160)).toEqual({
      url: 'https://www.wowhead.com/tbc/de/quest=10160', site: 'tbc', lang: 'de', kind: 'quest', id: 10160,
    });
  });
});

describe('clickableQuestIds', () => {
  it("is a quest's chain, without the quest on show or quests without an ID", () => {
    expect([...clickableQuestIds(onFelOrc)]).toEqual([10160, 10483]);
  });

  it("is an item's related quests, not its quest rewards", () => {
    expect([...clickableQuestIds(onReport)]).toEqual([10140, 10288]);
  });

  it('is nothing while loading, after an error, or with the popup closed', () => {
    expect(clickableQuestIds({ kind: 'loading', link: FEL_ORC }).size).toBe(0);
    expect(clickableQuestIds({ kind: 'error', link: FEL_ORC, message: 'x', header: null }).size).toBe(0);
    expect(clickableQuestIds(null).size).toBe(0);
  });
});

describe('pageName', () => {
  it('is the name the page gave', () => {
    expect(pageName(onReport)).toBe("Duron's Report");
    const header = { kind: 'item' as const, name: "Duron's Report", quality: 1, icon: '' };
    expect(pageName({ kind: 'error', link: DURONS_REPORT, message: 'x', header })).toBe("Duron's Report");
  });

  it('falls back to the kind and number', () => {
    expect(pageName({ kind: 'loading', link: DURONS_REPORT })).toBe('Item 28105');
    expect(pageName({ kind: 'error', link: FEL_ORC, message: 'x', header: null })).toBe('Quest 10482');
  });
});

describe('Trail', () => {
  it('opens a quest from the page on show, which joins the trail', () => {
    const trail = new Trail();
    expect(trail.open(onReport, 10288)?.link.url).toBe('https://www.wowhead.com/tbc/quest=10288');
    expect(trail.names()).toEqual(["Duron's Report"]);
  });

  it.each([
    ['a quest the page does not show', 99999],
    ['the quest on show', 10482],
    ['a quest without an ID', 0],
    ['a number in a string', '10160'],
    ['a fraction', 10160.5],
    ['nothing', undefined],
  ])('refuses %s', (_, id) => {
    const trail = new Trail();
    expect(trail.open(onFelOrc, id)).toBeNull();
    expect(trail.names()).toEqual([]);
  });

  it('refuses a click with the popup closed', () => {
    expect(new Trail().open(null, 10160)).toBeNull();
  });

  it('goes back to an earlier page, dropping it and everything after it', () => {
    const trail = new Trail();
    trail.open(onReport, 10288);
    const arrival: QuestInfo = {
      ...felOrc, name: 'Arrival in Outland',
      chain: [{ position: 1, quests: [{ id: 10140, name: 'Journey to Honor Hold', current: false }] }],
    };
    trail.open({ kind: 'ready', link: link('https://www.wowhead.com/tbc/quest=10288'), info: arrival }, 10140);
    expect(trail.names()).toEqual(["Duron's Report", 'Arrival in Outland']);
    expect(trail.back(0)?.link.url).toBe(DURONS_REPORT.url);
    expect(trail.names()).toEqual([]);
  });

  it.each([[-1], [1], [0.5], ['0'], [undefined]])('refuses to go back to %s', (index) => {
    const trail = new Trail();
    trail.open(onReport, 10288);
    expect(trail.back(index)).toBeNull();
    expect(trail.names()).toEqual(["Duron's Report"]);
  });

  it('starts over', () => {
    const trail = new Trail();
    trail.open(onReport, 10288);
    trail.clear();
    expect(trail.names()).toEqual([]);
  });
});

describe('spells', () => {
  const ARCANE_SHOT = link('https://www.wowhead.com/tbc/spell=27019');

  it('is nothing for a spell', () => {
    const state: PopupState = { kind: 'ready', link: ARCANE_SHOT, info: { kind: 'spell', name: 'Arcane Shot', quality: 1, icon: '', comments: [], commentTotal: 0 } };
    expect(clickableQuestIds(state).size).toBe(0);
  });

  it('names a spell "Spell N" until its name is known', () => {
    expect(pageName({ kind: 'loading', link: ARCANE_SHOT })).toBe('Spell 27019');
  });
});

describe('chains, names and guides', () => {
  const CHAIN = '#chain=10160~Know%20your%20Enemy.10482~Fel%20Orc%20Scavengers.10483~Ill%20Omens';
  const withChain = link(`https://www.wowhead.com/tbc/de/quest=10482${CHAIN}`);
  const onChain: PopupState = { kind: 'ready', link: withChain, info: { ...felOrc, chain: [] } };

  it('names the quest it opens, and the page it goes back to', () => {
    const trail = new Trail();
    expect(trail.open(onReport, 10288)?.name).toBe('Arrival in Outland');
    expect(trail.back(0)?.name).toBe("Duron's Report");
  });

  it('carries the chain only to quests in it', () => {
    const fromChain = new Trail().open(onChain, 10483);
    expect(fromChain?.link.url).toBe('https://www.wowhead.com/tbc/de/quest=10483');
    expect(fromChain?.link.chain).toEqual(withChain.chain);
    expect(questLink(FEL_ORC, 10160)).not.toHaveProperty('chain');
  });

  it('lets the player click every other quest of a Questie chain', () => {
    expect([...clickableQuestIds(onChain)]).toEqual([10160, 10483]);
  });

  it('opens only guides the page lists, on wowhead.com', () => {
    const guides = [{ title: 'Attunements', url: 'https://www.wowhead.com/tbc/guide/a' }, { title: 'Bad', url: 'https://evil.example/x' }];
    const state: PopupState = { kind: 'ready', link: FEL_ORC, info: { ...felOrc, guides } };
    expect(guideUrl(state, 0)).toBe('https://www.wowhead.com/tbc/guide/a');
    expect(guideUrl(state, 1)).toBeNull();
    expect(guideUrl(state, 5)).toBeNull();
    expect(guideUrl(state, '0')).toBeNull();
    expect(guideUrl(null, 0)).toBeNull();
  });

  it('names a loading page by the name it was opened with', () => {
    expect(pageName({ kind: 'loading', link: FEL_ORC, name: 'Know your Enemy' })).toBe('Know your Enemy');
  });
});

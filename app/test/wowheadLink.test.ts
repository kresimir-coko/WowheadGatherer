import { describe, expect, it } from 'vitest';
import { parseWowheadLink } from '../src/shared/wowheadLink';

describe('parseWowheadLink', () => {
  it('reads a TBC link', () => {
    expect(parseWowheadLink('https://www.wowhead.com/tbc/item=19019')).toEqual({
      url: 'https://www.wowhead.com/tbc/item=19019', site: 'tbc', lang: '', kind: 'item', id: 19019,
    });
  });

  it('reads a TBC link in German', () => {
    expect(parseWowheadLink('https://www.wowhead.com/tbc/de/item=19019')).toEqual({
      url: 'https://www.wowhead.com/tbc/de/item=19019', site: 'tbc', lang: 'de', kind: 'item', id: 19019,
    });
  });

  it('reads retail links, with and without a language', () => {
    expect(parseWowheadLink('https://www.wowhead.com/item=19019')).toEqual({
      url: 'https://www.wowhead.com/item=19019', site: '', lang: '', kind: 'item', id: 19019,
    });
    expect(parseWowheadLink('https://www.wowhead.com/de/item=19019')).toEqual({
      url: 'https://www.wowhead.com/de/item=19019', site: '', lang: 'de', kind: 'item', id: 19019,
    });
  });

  it('reads a WoW Forever link', () => {
    expect(parseWowheadLink('https://www.wowhead.com/forever/item=19019')?.site).toBe('forever');
  });

  it('drops the name Wowhead adds after the ID', () => {
    expect(parseWowheadLink('https://www.wowhead.com/tbc/item=19019/thunderfury-blessed-blade-of-the-windseeker')?.url)
      .toBe('https://www.wowhead.com/tbc/item=19019');
  });

  it('ignores spaces and a line break around the link', () => {
    expect(parseWowheadLink('  https://www.wowhead.com/tbc/item=19019\r\n')?.id).toBe(19019);
  });

  it.each([
    ['another site', 'https://www.example.com/tbc/item=19019'],
    ['text around the link', 'see https://www.wowhead.com/tbc/item=19019'],
    ['the language before the game', 'https://www.wowhead.com/de/tbc/item=19019'],
    ['an unknown language', 'https://www.wowhead.com/tbc/xx/item=19019'],
    ['item 0', 'https://www.wowhead.com/tbc/item=0'],
    ['plain http', 'http://www.wowhead.com/tbc/item=19019'],
    ['nothing', ''],
    ['quest 0', 'https://www.wowhead.com/tbc/quest=0'],
    ['an NPC', 'https://www.wowhead.com/tbc/npc=16820'],
    ['an achievement', 'https://www.wowhead.com/tbc/achievement=6'],
  ])('rejects %s', (_, text) => {
    expect(parseWowheadLink(text)).toBeNull();
  });

  it('reads a TBC quest link', () => {
    expect(parseWowheadLink('https://www.wowhead.com/tbc/quest=10482')).toEqual({
      url: 'https://www.wowhead.com/tbc/quest=10482', site: 'tbc', lang: '', kind: 'quest', id: 10482,
    });
  });

  it('reads a German WoW Forever quest link', () => {
    expect(parseWowheadLink('https://www.wowhead.com/forever/de/quest=10482')).toMatchObject({
      url: 'https://www.wowhead.com/forever/de/quest=10482', site: 'forever', lang: 'de', kind: 'quest', id: 10482,
    });
  });

  it('drops the name Wowhead adds after a quest ID', () => {
    expect(parseWowheadLink('https://www.wowhead.com/tbc/quest=10482/fel-orc-scavengers')?.url)
      .toBe('https://www.wowhead.com/tbc/quest=10482');
  });

  it('reads a TBC spell link', () => {
    expect(parseWowheadLink('https://www.wowhead.com/tbc/spell=27019')).toEqual({
      url: 'https://www.wowhead.com/tbc/spell=27019', site: 'tbc', lang: '', kind: 'spell', id: 27019,
    });
  });

  it('reads a WoW Forever spell link in German', () => {
    expect(parseWowheadLink('https://www.wowhead.com/forever/de/spell=27019/arkaner-schuss')?.url)
      .toBe('https://www.wowhead.com/forever/de/spell=27019');
  });

  it('rejects a huge clipboard quickly', () => {
    const text = 'https://www.wowhead.com/tbc/item=19019 ' + 'x'.repeat(5_000_000);
    const started = performance.now();
    expect(parseWowheadLink(text)).toBeNull();
    expect(performance.now() - started).toBeLessThan(50);
  });
});

describe('chains from Questie', () => {
  const base = 'https://www.wowhead.com/tbc/quest=9836';

  it('reads the chain after #chain=, and keeps the address plain', () => {
    const link = parseWowheadLink(`${base}#chain=9824~Arcane%20Disturbances.9836~The%20Master%27s%20Touch`);
    expect(link?.url).toBe(base);
    expect(link?.chain).toEqual([{ id: 9824, name: 'Arcane Disturbances' }, { id: 9836, name: "The Master's Touch" }]);
  });

  it('skips broken chain entries', () => {
    const link = parseWowheadLink(`${base}#chain=x~A.0~B.-3~C.12~%E0%A4%A.13~.14~Fine.15~Also%20fine`);
    expect(link?.chain).toEqual([{ id: 14, name: 'Fine' }, { id: 15, name: 'Also fine' }]);
  });

  it('caps the chain at 51 quests and names at 100 characters', () => {
    // One long name; the rest short, so the whole link stays under the 50,000-character limit.
    const entries = Array.from({ length: 80 }, (_, i) => `${i + 1}~${i === 0 ? 'N'.repeat(150) : 'Q'}`).join('.');
    const link = parseWowheadLink(`${base}#chain=${entries}`);
    expect(link?.chain).toHaveLength(51);
    expect(link?.chain?.[0].name).toHaveLength(100);
  });

  it('reads a whole chain of Russian names, which percent-encode six characters a letter', () => {
    // About 18,600 characters: 51 quests named with 60 Cyrillic letters each.
    const name = 'Ж'.repeat(60);
    const entries = Array.from({ length: 51 }, (_, i) => `${i + 1}~${encodeURIComponent(name)}`).join('.');
    const link = parseWowheadLink(`https://www.wowhead.com/tbc/ru/quest=26#chain=${entries}`);
    expect(link?.chain).toHaveLength(51);
    expect(link?.chain?.[25]).toEqual({ id: 26, name });
  });

  it('has no chain for one quest, an item, or no fragment', () => {
    expect(parseWowheadLink(`${base}#chain=9836~Alone`)?.chain).toBeUndefined();
    expect(parseWowheadLink('https://www.wowhead.com/tbc/item=19019#chain=1~A.2~B')?.chain).toBeUndefined();
    expect(parseWowheadLink(base)).not.toHaveProperty('chain');
  });
});

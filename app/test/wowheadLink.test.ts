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

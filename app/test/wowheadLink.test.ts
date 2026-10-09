import { describe, expect, it } from 'vitest';
import { parseWowheadLink } from '../src/shared/wowheadLink';

describe('parseWowheadLink', () => {
  it('reads a TBC link', () => {
    expect(parseWowheadLink('https://www.wowhead.com/tbc/item=19019')).toEqual({
      url: 'https://www.wowhead.com/tbc/item=19019', site: 'tbc', lang: '', itemId: 19019,
    });
  });

  it('reads a TBC link in German', () => {
    expect(parseWowheadLink('https://www.wowhead.com/tbc/de/item=19019')).toEqual({
      url: 'https://www.wowhead.com/tbc/de/item=19019', site: 'tbc', lang: 'de', itemId: 19019,
    });
  });

  it('reads retail links, with and without a language', () => {
    expect(parseWowheadLink('https://www.wowhead.com/item=19019')).toEqual({
      url: 'https://www.wowhead.com/item=19019', site: '', lang: '', itemId: 19019,
    });
    expect(parseWowheadLink('https://www.wowhead.com/de/item=19019')).toEqual({
      url: 'https://www.wowhead.com/de/item=19019', site: '', lang: 'de', itemId: 19019,
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
    expect(parseWowheadLink('  https://www.wowhead.com/tbc/item=19019\r\n')?.itemId).toBe(19019);
  });

  it.each([
    ['another site', 'https://www.example.com/tbc/item=19019'],
    ['a spell', 'https://www.wowhead.com/tbc/spell=133'],
    ['text around the link', 'see https://www.wowhead.com/tbc/item=19019'],
    ['the language before the game', 'https://www.wowhead.com/de/tbc/item=19019'],
    ['an unknown language', 'https://www.wowhead.com/tbc/xx/item=19019'],
    ['item 0', 'https://www.wowhead.com/tbc/item=0'],
    ['plain http', 'http://www.wowhead.com/tbc/item=19019'],
    ['nothing', ''],
  ])('rejects %s', (_, text) => {
    expect(parseWowheadLink(text)).toBeNull();
  });

  it('rejects a huge clipboard quickly', () => {
    const text = 'https://www.wowhead.com/tbc/item=19019 ' + 'x'.repeat(5_000_000);
    const started = performance.now();
    expect(parseWowheadLink(text)).toBeNull();
    expect(performance.now() - started).toBeLessThan(50);
  });
});

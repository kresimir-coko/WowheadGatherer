import { describe, expect, it } from 'vitest';
import { isCompletePage, isErrorPage, parseItemPage, sliceBracketed } from '../src/main/wowheadPage';
import { parseZoneNames } from '../src/main/zones';
import { fixture } from './fixtures';

describe('sliceBracketed', () => {
  it('finds the matching bracket', () => {
    expect(sliceBracketed('x [1, {"a": [2]}] y', 2)).toBe('[1, {"a": [2]}]');
  });

  it('ignores brackets in strings of either quote, with escapes', () => {
    const text = `{"a": "]}", b: '}{', c: "say \\"]\\""}`;
    expect(sliceBracketed(text, 0)).toBe(text);
  });

  it('returns null when the bracket never closes', () => {
    expect(sliceBracketed('[1, [2]', 0)).toBeNull();
  });
});

describe('parseItemPage', () => {
  it('reads the item, its tables and its comments (Gorehowl)', () => {
    const page = parseItemPage(fixture('item-28773.html.gz'));
    expect(page.gatherer.get(3)?.get(28773)).toEqual({ name: 'Gorehowl', quality: 4, icon: 'inv_axe_60' });
    const droppedBy = page.listviews.get('dropped-by');
    expect(droppedBy).toHaveLength(1);
    expect(droppedBy?.[0]).toMatchObject({ name: 'Prince Malchezaar', location: [3457], count: 327, outof: 1822 });
    expect(page.comments).toHaveLength(90);
    expect(page.comments[0]).toMatchObject({ rating: 300, user: '7600', indent: 0, sticky: false, deleted: false });
  });

  it('reads every source table (Netherweave Cloth)', () => {
    const page = parseItemPage(fixture('item-21877.html.gz'));
    expect(page.listviews.get('dropped-by')).toHaveLength(200);
    expect(page.listviews.get('contained-in-item')).toHaveLength(2);
    expect(page.listviews.get('contained-in-object')).toHaveLength(15);
    expect(page.listviews.get('fished-in')).toHaveLength(2);
    expect(page.listviews.get('reagent-for')).toHaveLength(14);
  });

  it('reads vendor prices in badges (Faceguard of Determination)', () => {
    const page = parseItemPage(fixture('item-32083.html.gz'));
    expect(page.listviews.get('sold-by')?.[0]).toMatchObject({ name: "G'eras", cost: [[0, [], [[29434, 50]]]] });
    expect(page.gatherer.get(3)?.get(29434)?.name).toBe('Badge of Justice');
  });

  it('finds no item on the not-found page', () => {
    expect(parseItemPage(fixture('item-999999.html.gz')).gatherer.get(3)?.get(999999)).toBeUndefined();
  });

  it('copes with a page that is not a Wowhead page', () => {
    expect(parseItemPage('<html><body>Request blocked.</body></html>')).toEqual({
      gatherer: new Map(), listviews: new Map(), comments: [],
    });
  });

  it('skips data that is cut off', () => {
    expect(parseItemPage('WH.Gatherer.addData(3, 5, {"1":{"name_enus":"Cut').gatherer.size).toBe(0);
  });
});

describe('isCompletePage', () => {
  it('accepts a whole item page', () => {
    expect(isCompletePage(fixture('item-21877.html.gz'))).toBe(true);
  });

  it('rejects a page read while the browser was still parsing it (item data, but no tables yet)', () => {
    const html = fixture('item-21877.html.gz');
    expect(isCompletePage(html.slice(0, html.indexOf('new Listview(')))).toBe(false);
  });

  it('accepts a whole quest page', () => {
    expect(isCompletePage(fixture('quest-10482.html.gz'))).toBe(true);
  });

  it("rejects Wowhead's bot check", () => {
    expect(isCompletePage('<script src="https://x.awswaf.com/challenge.js"></script>')).toBe(false);
  });
});

describe('isErrorPage', () => {
  it("knows Wowhead's error page, where a page whose files failed to load is sent", () => {
    expect(isErrorPage('https://www.wowhead.com/error-static-cdn?hash=3baaafd2d9b&at=1791895908&redirect=%2Ftbc%2Fquest%3D10483')).toBe(true);
  });

  it('takes no ordinary page for it', () => {
    expect(isErrorPage('https://www.wowhead.com/tbc/quest=10483/ill-omens')).toBe(false);
    expect(isErrorPage('https://www.wowhead.com/tbc/item=19019/thunderfury#comments:error')).toBe(false);
    expect(isErrorPage('')).toBe(false);
  });
});

describe('parseZoneNames', () => {
  it('reads the TBC zone names', () => {
    const zones = parseZoneNames(fixture('global-tbc.js.gz'));
    expect(zones.size).toBe(168);
    expect(zones.get(3457)).toBe('Karazhan');
    expect(zones.get(12)).toBe('Elwynn Forest');
  });

  it('has no names for anything else', () => {
    expect(parseZoneNames('nothing here').size).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { buildItemInfo, formatChance } from '../src/main/itemInfo';
import { parseItemPage, type ItemPage, type ListviewRow } from '../src/main/wowheadPage';
import { parseZoneNames } from '../src/main/zones';
import { fixture } from './fixtures';

const zones = parseZoneNames(fixture('global-tbc.js.gz'));
const info = (id: number) => {
  const built = buildItemInfo(id, parseItemPage(fixture(`item-${id}.html.gz`)), zones);
  if (!built) throw new Error(`no info for ${id}`);
  return built;
};
const section = (id: number, title: string) => {
  const found = info(id).sections.find((s) => s.title === title);
  if (!found) throw new Error(`no "${title}" for ${id}`);
  return found;
};

describe('formatChance', () => {
  it.each([
    [327, 1822, '18%'], [20, 25, '80%'], [74, 956, '7.7%'], [1, 116, '0.86%'], [1, 21720, '<0.01%'], [5, 4, '100%'],
  ])('%d of %d is %s', (count, outof, expected) => {
    expect(formatChance(count, outof)).toBe(expected);
  });

  it.each([[-1, 10], [0, 10], [3, 0], [undefined, 5], ['3', 5]])('has no chance for %s of %s', (count, outof) => {
    expect(formatChance(count, outof)).toBeNull();
  });
});

describe('buildItemInfo', () => {
  it('Gorehowl: dropped by Prince Malchezaar in Karazhan', () => {
    const gorehowl = info(28773);
    expect(gorehowl).toMatchObject({ kind: 'item', name: 'Gorehowl', quality: 4, icon: 'inv_axe_60', commentTotal: 90 });
    expect(gorehowl.sections).toEqual([
      { title: 'Dropped by', total: 1, rows: [{ name: 'Prince Malchezaar', details: ['Karazhan', '18%'] }] },
    ]);
  });

  it('Netherweave Cloth: best drop chances first, small samples last', () => {
    expect(info(21877).sections.map((s) => s.title)).toEqual(['Dropped by', 'Contained in', 'Fished in']);
    const dropped = section(21877, 'Dropped by');
    expect(dropped.total).toBe(200);
    expect(dropped.rows).toEqual([
      { name: 'Heckling Fel Sprite', details: ['Hellfire Peninsula', '83%'] },
      { name: 'Flamewaker Imp', details: ['Hellfire Peninsula', '82%'] },
      { name: 'Trogma', details: ["Blade's Edge Mountains", '80%'] },
      { name: 'Dr. Boom', details: ['Netherstorm', '79%'] },
      { name: 'Dreadwarden', details: ['Shadowmoon Valley', '78%'] },
    ]);
  });

  it('Netherweave Cloth: containers from items and objects together', () => {
    const contained = section(21877, 'Contained in');
    expect(contained.total).toBe(17);
    expect(contained.rows.map((r) => r.name)).toEqual([
      'Curious Crate', 'Enlistment Bonus', 'Heavy Fel Iron Chest', 'Felsteel Chest', 'Adamantite Bound Chest',
    ]);
    expect(contained.rows[0].details).toEqual(['32%']);
    expect(contained.rows[2].details).toEqual(["Terokkar Forest, Blade's Edge Mountains +1", '7.7%']);
    expect(section(21877, 'Fished in').rows[0]).toEqual({ name: 'Zangarmarsh', details: ['<0.01%'] });
  });

  it('Refreshing Spring Water: vendors with price and side, quests with level and side', () => {
    expect(info(159).sections.map((s) => s.title)).toEqual([
      'Needed for', 'Dropped by', 'Sold by', 'Quest reward', 'Contained in', 'Mined from', 'Pickpocketed from',
    ]);
    const soldBy = section(159, 'Sold by');
    expect(soldBy.total).toBe(200);
    expect(soldBy.rows[0]).toEqual({ name: 'Brog Hamfist', details: ['Elwynn Forest', '25c', 'Alliance'] });
    expect(section(159, 'Needed for').rows[0]).toEqual({ name: 'Give Gerard a Drink', details: ['Level 1', 'Alliance'], questId: 16 });
    expect(section(159, 'Quest reward').rows[0]).toEqual({ name: "A Rogue's Deal", details: ['Level 5', 'Horde'] });
    expect(section(159, 'Pickpocketed from').rows.map((r) => r.details.at(-1))).toEqual(['1.5%', '0.86%', '9.1%']);
    expect(section(159, 'Mined from').rows[0]).toEqual({ name: 'Copper Vein', details: ['The Barrens, Dun Morogh +1', '<0.01%'] });
  });

  it("Magtheridon's Head: the quest it starts, listed once", () => {
    const head = info(32385);
    expect(head.sections[0]).toEqual({
      title: 'Starts quest', total: 1,
      rows: [{ name: 'The Fall of Magtheridon', details: ['Level 70', 'Alliance'], questId: 11002 }],
    });
    // Wowhead also lists it as needing the head; it isn't repeated.
    expect(head.sections.map((s) => s.title)).not.toContain('Needed for');
  });

  it('Unidentified Plant Parts: the quests that need it, first', () => {
    expect(info(24401).sections[0]).toEqual({
      title: 'Needed for', total: 2,
      rows: [
        { name: 'Identify Plant Parts', details: ['Level 64'], questId: 9784 },
        { name: 'Plants of Zangarmarsh', details: ['Level 63'], questId: 9802 },
      ],
    });
  });

  it("Duron's Report: needed for two quests, and no comments", () => {
    const report = info(28105);
    expect(report.sections[0].rows.map((row) => row.questId)).toEqual([10140, 10288]);
    expect(report).toMatchObject({ comments: [], commentTotal: 0 });
  });

  it('Bolt of Netherweave: what it is crafted from', () => {
    expect(section(21840, 'Crafted with').rows).toEqual([{ name: 'Bolt of Netherweave', details: ['6 × Netherweave Cloth'] }]);
    expect(section(21840, 'Contained in').rows[1].details).toEqual(["Terokkar Forest, Blade's Edge Mountains +1", '2.0%']);
  });

  it('Faceguard of Determination: prices in badges, sold to both sides', () => {
    expect(section(32083, 'Sold by').rows).toEqual([{ name: "G'eras", details: ['Shattrath City', '50 × Badge of Justice'] }]);
  });

  it('Fel Iron Ore: mining', () => {
    expect(section(23424, 'Mined from').rows).toEqual([
      { name: 'Fel Iron Deposit', details: ['Hellfire Peninsula, Zangarmarsh +1', '99%'] },
    ]);
  });

  it('Thunderfury: a quest reward for both sides', () => {
    expect(section(19019, 'Quest reward').rows).toEqual([{ name: 'Rise, Thunderfury!', details: ['Level 60'] }]);
  });

  it('returns null when the page lacks the item', () => {
    expect(buildItemInfo(999999, parseItemPage(fixture('item-999999.html.gz')), zones)).toBeNull();
  });

  it('lists rows with missing details, just with fewer of them', () => {
    const page: ItemPage = {
      gatherer: new Map([[3, new Map([[1, { name: 'Thing', quality: 2 }]])]]),
      comments: [],
      listviews: new Map<string, ListviewRow[]>([
        ['dropped-by', [{ name: 'No Count' }, { name: 'Odd Count', count: -1, outof: 0, location: ['x', -1, 99999] }, { id: 5 }]],
        ['sold-by', [{ name: 'Free Vendor', cost: [[0]] }, { name: 'Strange Price', cost: [[0, [], [[42, 3], 'junk']]] }]],
        ['created-by-spell', [{ name: 'Mystery Recipe', reagents: [[77, 2], [null, 1]] }]],
      ]),
    };
    const thing = buildItemInfo(1, page, new Map());
    expect(thing).toMatchObject({ name: 'Thing', quality: 2, icon: '', comments: [], commentTotal: 0 });
    expect(thing?.sections).toEqual([
      { title: 'Dropped by', total: 3, rows: [{ name: 'No Count', details: [] }, { name: 'Odd Count', details: [] }] },
      { title: 'Sold by', total: 2, rows: [{ name: 'Free Vendor', details: [] }, { name: 'Strange Price', details: ['3 × item 42'] }] },
      { title: 'Crafted with', total: 1, rows: [{ name: 'Mystery Recipe', details: ['2 × item 77'] }] },
    ]);
  });
});

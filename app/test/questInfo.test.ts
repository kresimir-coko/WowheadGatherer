import { describe, expect, it } from 'vitest';
import { buildQuestInfo } from '../src/main/questInfo';
import { parseQuestPage } from '../src/main/questPage';
import { parseZoneNames } from '../src/main/zones';
import { fixture } from './fixtures';

const zones = parseZoneNames(fixture('global-tbc.js.gz'));
const info = (id: number, file: string) => buildQuestInfo(id, parseQuestPage(fixture(file)), zones);

describe('buildQuestInfo', () => {
  it('Fel Orc Scavengers: name, quest icon, chain and the best comments', () => {
    const quest = info(10482, 'quest-10482.html.gz');
    // The page names its icon "quest-start", but Wowhead's image server has no such file.
    expect(quest).toMatchObject({ kind: 'quest', name: 'Fel Orc Scavengers', quality: 1, icon: 'inv_misc_note_01', commentTotal: 21 });
    expect(quest?.chain).toHaveLength(3);
    expect(quest?.comments).toHaveLength(21);
    // The page links every chain quest but the one on show; it gets the page's own ID.
    expect(quest?.chain[1].quests[0]).toEqual({ id: 10482, name: 'Fel Orc Scavengers', current: true });
  });

  it('takes the name from the heading, in the page language', () => {
    // The German page's Gatherer data names the quest in English first.
    expect(info(10482, 'quest-de-10482.html.gz')?.name).toBe('Plünderer der Höllenorcs');
  });

  it('The Ring of Blood: The Final Challenge: comments, no chain', () => {
    expect(info(9977, 'quest-9977.html.gz')).toMatchObject({ chain: [], commentTotal: 101 });
  });

  it("The Master's Touch: Wowhead's guides, kept on wowhead.com", () => {
    const quest = info(9836, 'quest-9836.html.gz');
    expect(quest?.guides).toEqual([
      { title: 'Attunements Guide: Attunements Walkthrough, Quests and Locations - TBC Classic', url: 'https://www.wowhead.com/tbc/guide/attunement-dungeons-raids-burning-crusade-classic' },
      { title: 'Black Morass Dungeon Quests Guide for Burning Crusade Classic', url: 'https://www.wowhead.com/tbc/guide/black-morass-dungeon-quest-guide-burning-crusade-classic-wow' },
    ]);
    expect(info(10482, 'quest-10482.html.gz')?.guides).toHaveLength(3);
  });

  it('skips guides that are not on wowhead.com, and keeps 3 at most', () => {
    const rows = [
      { title: 'Elsewhere', url: 'https://evil.example/guide' }, { title: 'A', url: 'https://www.wowhead.com/tbc/guide/a' },
      { title: 'B', url: 'https://www.wowhead.com/tbc/guide/b' }, { title: 'C', url: 'https://www.wowhead.com/tbc/guide/c' },
      { title: 'D', url: 'https://www.wowhead.com/tbc/guide/d' },
    ];
    const page = parseQuestPage(fixture('quest-10482.html.gz'));
    page.data.listviews.set('guides', rows);
    expect(buildQuestInfo(10482, page, zones)?.guides.map((guide) => guide.title)).toEqual(['A', 'B', 'C']);
  });

  it('returns null when the page lacks the quest', () => {
    expect(info(1, 'quest-10482.html.gz')).toBeNull();
  });
});

describe('quest rewards', () => {
  it('Fel Orc Scavengers: five items to choose from, money, experience and reputation', () => {
    const rewards = info(10482, 'quest-10482.html.gz')?.rewards;
    expect(rewards?.choice).toHaveLength(5);
    expect(rewards?.choice[0]).toEqual({ id: 29915, name: 'Desolation Rod', quality: 2, icon: 'inv_wand_14', count: 1 });
    expect(rewards).toMatchObject({ always: [], money: 9000, xp: 9020, moneyAtCap: 5400, reputation: [{ faction: 'Honor Hold', amount: 250 }] });
  });

  it('Return to Khadgar: an item everyone gets', () => {
    expect(info(9837, 'quest-9837.html.gz')?.rewards).toEqual({
      choice: [],
      always: [{ id: 24490, name: "The Master's Key", quality: 1, icon: 'inv_misc_key_07', count: 1 }],
      money: 0, xp: 19000, moneyAtCap: 114000,
      reputation: [{ faction: 'The Violet Eye', amount: 500 }],
    });
  });

  it("The Master's Touch: no items, the gold paid at the level cap", () => {
    expect(info(9836, 'quest-9836.html.gz')?.rewards).toMatchObject({ choice: [], always: [], money: 0, xp: 25300, moneyAtCap: 151800 });
  });

  it('names items and factions in the page language', () => {
    const rewards = info(10482, 'quest-de-10482.html.gz')?.rewards;
    expect(rewards?.choice[0].name).toBe('Rute der Verwüstung');
    expect(rewards?.reputation).toEqual([{ faction: 'Ehrenfeste', amount: 250 }]);
  });

  it('keeps an item the page has no data for, by its ID', () => {
    const page = parseQuestPage(fixture('quest-10482.html.gz'));
    page.data.gatherer.get(3)?.delete(29915);
    expect(buildQuestInfo(10482, page, zones)?.rewards?.choice[0]).toEqual({ id: 29915, name: 'Item 29915', quality: 1, icon: '', count: 1 });
  });

  it('has no rewards when the page lists none', () => {
    const page = parseQuestPage(fixture('quest-10482.html.gz'));
    page.details.clear();
    page.moneyAtCap = 0;
    expect(buildQuestInfo(10482, page, zones)?.rewards).toBeNull();
  });
});

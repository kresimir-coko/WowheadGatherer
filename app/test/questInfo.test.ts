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

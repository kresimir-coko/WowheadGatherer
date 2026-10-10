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
    expect(quest?.comments).toHaveLength(3);
  });

  it('takes the name from the heading, in the page language', () => {
    // The German page's Gatherer data names the quest in English first.
    expect(info(10482, 'quest-de-10482.html.gz')?.name).toBe('Plünderer der Höllenorcs');
  });

  it('The Ring of Blood: The Final Challenge: comments, no chain', () => {
    expect(info(9977, 'quest-9977.html.gz')).toMatchObject({ chain: [], commentTotal: 101 });
  });

  it('returns null when the page lacks the quest', () => {
    expect(info(1, 'quest-10482.html.gz')).toBeNull();
  });
});

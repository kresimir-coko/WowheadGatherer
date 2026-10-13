import { describe, expect, it } from 'vitest';
import { chainFor } from '../src/shared/chain';
import type { PopupState, QuestInfo } from '../src/shared/types';
import { parseWowheadLink } from '../src/shared/wowheadLink';

const quest: QuestInfo = {
  kind: 'quest', name: "The Master's Touch", quality: 1, icon: '', comments: [], commentTotal: 0, guides: [], rewards: null,
  chain: [
    { position: 1, quests: [{ id: 9836, name: "The Master's Touch", current: true }] },
    { position: 2, quests: [{ id: 9837, name: 'Return to Khadgar', current: false }] },
  ],
};
const withChain = parseWowheadLink('https://www.wowhead.com/tbc/quest=9836#chain=9824~Arcane%20Disturbances.9836~The%20Master%27s%20Touch.9837~Return%20to%20Khadgar')!;
const plain = parseWowheadLink('https://www.wowhead.com/tbc/quest=9836')!;

describe('chainFor', () => {
  it("is Questie's whole chain when the link carries one", () => {
    expect(chainFor({ kind: 'ready', link: withChain, info: quest })).toEqual([
      { position: 1, quests: [{ id: 9824, name: 'Arcane Disturbances', current: false }] },
      { position: 2, quests: [{ id: 9836, name: "The Master's Touch", current: true }] },
      { position: 3, quests: [{ id: 9837, name: 'Return to Khadgar', current: false }] },
    ]);
  });

  it("is Wowhead's Series box otherwise", () => {
    expect(chainFor({ kind: 'ready', link: plain, info: quest })).toBe(quest.chain);
  });

  it('is nothing for items, spells, loading and errors', () => {
    const spell = parseWowheadLink('https://www.wowhead.com/tbc/spell=27019')!;
    const states: PopupState[] = [
      { kind: 'loading', link: withChain },
      { kind: 'error', link: withChain, message: 'x', header: null },
      { kind: 'ready', link: spell, info: { kind: 'spell', name: 'Arcane Shot', quality: 1, icon: '', comments: [], commentTotal: 0 } },
    ];
    for (const state of states) expect(chainFor(state)).toEqual([]);
  });
});

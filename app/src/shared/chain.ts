import type { ChainStep, PopupState } from './types';

/** The chain a quest page shows: the whole one from Questie when the link carries it, else Wowhead's Series box. */
export function chainFor(state: PopupState): ChainStep[] {
  if (state.kind !== 'ready' || state.info.kind !== 'quest') return [];
  const fromQuestie = state.link.chain;
  if (fromQuestie && fromQuestie.length > 1) {
    return fromQuestie.map((quest, i) => ({
      position: i + 1,
      quests: [{ id: quest.id, name: quest.name, current: quest.id === state.link.id }],
    }));
  }
  return state.info.chain;
}

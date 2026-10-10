import type { QuestInfo } from '../shared/types';
import { pickComments } from './comments';
import { pageNames } from './itemInfo';
import type { QuestPage } from './questPage';
import type { ZoneNames } from './zones';

/** Wowhead's type number for quests in WH.Gatherer.addData. */
const QUEST_TYPE = 5;
/**
 * The icon shown for every quest: a parchment note. Wowhead's quest pages name theirs
 * "quest-start", but its image server has no such file.
 */
export const QUEST_ICON = 'inv_misc_note_01';

/** Everything the popup shows for a quest, or null when the page doesn't have the quest's data. */
export function buildQuestInfo(questId: number, page: QuestPage, zones: ZoneNames): QuestInfo | null {
  const quest = page.data.gatherer.get(QUEST_TYPE)?.get(questId);
  if (!quest) return null;
  const { comments, total } = pickComments(page.data, pageNames(page.data, zones));
  return {
    kind: 'quest',
    // The heading is in the page's language; the Gatherer data can be in English.
    name: page.name ?? quest.name,
    quality: 1,
    icon: QUEST_ICON,
    // The page doesn't link the quest on show, so it gets the page's own ID.
    chain: page.chain.map((step) => ({
      ...step,
      quests: step.quests.map((chainQuest) => (chainQuest.current ? { ...chainQuest, id: questId } : chainQuest)),
    })),
    comments,
    commentTotal: total,
  };
}

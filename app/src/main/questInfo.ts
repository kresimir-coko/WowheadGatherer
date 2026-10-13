import type { Guide, QuestInfo } from '../shared/types';
import { pickComments } from './comments';
import { pageNames } from './itemInfo';
import type { QuestPage } from './questPage';
import type { ItemPage } from './wowheadPage';
import type { ZoneNames } from './zones';

/** Wowhead's type number for quests in WH.Gatherer.addData. */
const QUEST_TYPE = 5;
/**
 * The icon shown for every quest: a parchment note. Wowhead's quest pages name theirs
 * "quest-start", but its image server has no such file.
 */
export const QUEST_ICON = 'inv_misc_note_01';
/** Guides shown per quest. */
const MAX_GUIDES = 3;
/** The only addresses a guide may have: Wowhead's own. */
export const GUIDE_URL = /^https:\/\/www\.wowhead\.com\/[\w/.-]+$/;

/** The guides the page links (its "guides" Listview), on wowhead.com, at most MAX_GUIDES. */
function readGuides(page: ItemPage): Guide[] {
  return (page.listviews.get('guides') ?? [])
    .flatMap((row) => (typeof row.title === 'string' && typeof row.url === 'string' && GUIDE_URL.test(row.url)
      ? [{ title: row.title.replace(/\s+/g, ' ').trim(), url: row.url }]
      : []))
    .slice(0, MAX_GUIDES);
}

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
    guides: readGuides(page.data),
    comments,
    commentTotal: total,
  };
}

import type { Guide, QuestInfo, QuestRewards, RewardItem } from '../shared/types';
import { pickComments } from './comments';
import { pageNames } from './itemInfo';
import type { QuestPage } from './questPage';
import type { GathererEntry, ItemPage } from './wowheadPage';
import type { ZoneNames } from './zones';

/** Wowhead's type numbers for items and quests in WH.Gatherer.addData. */
const ITEM_TYPE = 3;
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

/** A count or amount Wowhead gives, or 0 when it's missing or not above zero. */
function positive(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Reward items from the quest's details ([[id, count], …]), named from the page's item data. */
function rewardItems(value: unknown, items: Map<number, GathererEntry> | undefined): RewardItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((pair) => {
    const id = Array.isArray(pair) ? positive(pair[0]) : 0;
    if (!id) return [];
    const item = items?.get(id);
    return [{ id, name: item?.name ?? `Item ${id}`, quality: item?.quality ?? 1, icon: item?.icon ?? '', count: positive(pair[1]) || 1 }];
  });
}

/** What finishing the quest gives, or null when the page lists nothing. */
function readRewards(questId: number, page: QuestPage): QuestRewards | null {
  const details = page.details.get(questId) ?? {};
  const items = page.data.gatherer.get(ITEM_TYPE);
  const reputation = (Array.isArray(details.reprewards) ? details.reprewards : []).flatMap((pair) => {
    const id = Array.isArray(pair) ? positive(pair[0]) : 0;
    const amount = Array.isArray(pair) && typeof pair[1] === 'number' && Number.isFinite(pair[1]) ? Math.trunc(pair[1]) : 0;
    return id && amount ? [{ faction: page.factions.get(id) ?? `Faction ${id}`, amount }] : [];
  });
  const rewards: QuestRewards = {
    choice: rewardItems(details.itemchoices, items),
    always: rewardItems(details.itemrewards, items),
    money: positive(details.money),
    xp: positive(details.xp),
    moneyAtCap: page.moneyAtCap,
    reputation,
  };
  const givesSomething = rewards.choice.length > 0 || rewards.always.length > 0 || reputation.length > 0
    || rewards.money > 0 || rewards.xp > 0 || rewards.moneyAtCap > 0;
  return givesSomething ? rewards : null;
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
    rewards: readRewards(questId, page),
    comments,
    commentTotal: total,
  };
}

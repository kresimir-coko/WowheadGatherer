import { chainFor } from '../shared/chain';
import { pageName } from '../shared/pageName';
import type { PopupState } from '../shared/types';
import { parseWowheadLink, type WowheadLink } from '../shared/wowheadLink';
import { GUIDE_URL } from './questInfo';

/** A page in the trail, or one about to be shown: its link, and its name for the breadcrumb. */
export interface TrailStep {
  link: WowheadLink;
  name: string;
}

/** The address of quest id on the same game and language as the page it's opened from. */
export function questLink(from: WowheadLink, id: number): WowheadLink | null {
  const path = [from.site, from.lang].filter(Boolean).map((part) => `${part}/`).join('');
  const link = parseWowheadLink(`https://www.wowhead.com/${path}quest=${id}`);
  // A quest opened from within a Questie chain is part of the same chain.
  if (link && from.chain?.some((quest) => quest.id === id)) link.chain = from.chain;
  return link;
}

/** The quests a page lets the player open: its chain's other quests, or an item's related quests. */
export function clickableQuestIds(state: PopupState | null): Set<number> {
  const ids = new Set<number>();
  if (state?.kind !== 'ready') return ids;
  for (const step of chainFor(state)) {
    for (const quest of step.quests) if (!quest.current && quest.id > 0) ids.add(quest.id);
  }
  if (state.info.kind === 'item') {
    for (const section of state.info.sections) {
      for (const row of section.rows) if (row.questId) ids.add(row.questId);
    }
  }
  return ids;
}

/** The name quest id has on the page on show, for the title while it loads. */
function clickedName(state: PopupState, id: number): string | undefined {
  for (const step of chainFor(state)) {
    for (const quest of step.quests) if (quest.id === id) return quest.name;
  }
  if (state.kind === 'ready' && state.info.kind === 'item') {
    for (const section of state.info.sections) {
      for (const row of section.rows) if (row.questId === id) return row.name;
    }
  }
  return undefined;
}

function isIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** The address of guide index on the page on show, or null when the page has no such guide. */
export function guideUrl(state: PopupState | null, index: unknown): string | null {
  if (state?.kind !== 'ready' || state.info.kind !== 'quest' || !isIndex(index)) return null;
  const guide = state.info.guides[index];
  return guide && GUIDE_URL.test(guide.url) ? guide.url : null;
}

/**
 * The pages the player clicked through in the popup, oldest first. The page only
 * sends numbers; this decides what they may open. A fresh lookup from the game starts it over.
 */
export class Trail {
  private steps: TrailStep[] = [];

  /** The breadcrumb: the names of the earlier pages, oldest first. */
  names(): string[] {
    return this.steps.map((step) => step.name);
  }

  clear(): void {
    this.steps = [];
  }

  /**
   * Leaves the page on show for quest id, when that page lets the player click it,
   * and returns the quest's link and name. A stale or forged click gives null.
   */
  open(current: PopupState | null, id: unknown): TrailStep | null {
    if (current === null || typeof id !== 'number' || !clickableQuestIds(current).has(id)) return null;
    const link = questLink(current.link, id);
    if (!link) return null;
    this.steps.push({ link: current.link, name: pageName(current) });
    return { link, name: clickedName(current, id) ?? `Quest ${id}` };
  }

  /** Goes back to earlier page index, dropping it and everything after it, and returns it; null for no such page. */
  back(index: unknown): TrailStep | null {
    if (!isIndex(index) || index >= this.steps.length) return null;
    const step = this.steps[index];
    this.steps = this.steps.slice(0, index);
    return step;
  }
}

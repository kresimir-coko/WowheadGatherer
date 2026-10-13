import { pageName } from '../shared/pageName';
import type { PopupState } from '../shared/types';
import { parseWowheadLink, type WowheadLink } from '../shared/wowheadLink';

/** A page the player clicked away from: its link, and its name for the breadcrumb. */
interface Step {
  link: WowheadLink;
  name: string;
}

/** The address of quest id on the same game and language as the page it's opened from. */
export function questLink(from: WowheadLink, id: number): WowheadLink | null {
  const path = [from.site, from.lang].filter(Boolean).map((part) => `${part}/`).join('');
  return parseWowheadLink(`https://www.wowhead.com/${path}quest=${id}`);
}

/** The quests a page lets the player open: its chain's other quests, or an item's related quests. */
export function clickableQuestIds(state: PopupState | null): Set<number> {
  const ids = new Set<number>();
  if (state?.kind !== 'ready') return ids;
  const { info } = state;
  if (info.kind === 'quest') {
    for (const step of info.chain) {
      for (const quest of step.quests) if (!quest.current && quest.id > 0) ids.add(quest.id);
    }
  } else if (info.kind === 'item') {
    for (const section of info.sections) {
      for (const row of section.rows) if (row.questId) ids.add(row.questId);
    }
  }
  return ids;
}

function isIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * The pages the player clicked through in the popup, oldest first. The page only
 * sends numbers; this decides what they may open. A fresh lookup from the game starts it over.
 */
export class Trail {
  private steps: Step[] = [];

  /** The breadcrumb: the names of the earlier pages, oldest first. */
  names(): string[] {
    return this.steps.map((step) => step.name);
  }

  clear(): void {
    this.steps = [];
  }

  /**
   * Leaves the page on show for quest id, when that page lets the player click it,
   * and returns the quest's link. A stale or forged click gives null.
   */
  open(current: PopupState | null, id: unknown): WowheadLink | null {
    if (current === null || typeof id !== 'number' || !clickableQuestIds(current).has(id)) return null;
    const link = questLink(current.link, id);
    if (link) this.steps.push({ link: current.link, name: pageName(current) });
    return link;
  }

  /** Goes back to earlier page index, dropping it and everything after it, and returns its link; null for no such page. */
  back(index: unknown): WowheadLink | null {
    if (!isIndex(index) || index >= this.steps.length) return null;
    const { link } = this.steps[index];
    this.steps = this.steps.slice(0, index);
    return link;
  }
}

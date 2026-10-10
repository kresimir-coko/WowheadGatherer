import type { LookupKind, WowheadLink } from './wowheadLink';

/** One line of a section: who or what, and the details after it. */
export interface SourceRow {
  name: string;
  /** e.g. ["Karazhan", "18%"], shown joined with " · ". */
  details: string[];
  /** The quest a Starts quest or Needed for row is about, which the player can open from the popup. */
  questId?: number;
}

export interface SourceSection {
  title: string;
  rows: SourceRow[];
  /** How many rows Wowhead lists; more than rows.length means "+N more on Wowhead". */
  total: number;
}

export type MarkupContainerKind = 'bold' | 'italic' | 'underline' | 'small' | 'quote' | 'listItem';

/** A comment's text after Wowhead's markup is read: never HTML. */
export type MarkupNode =
  | { kind: 'text'; text: string }
  | { kind: 'break' }
  | { kind: MarkupContainerKind; children: MarkupNode[] };

export interface ItemComment {
  /** The author's name, or "" when Wowhead only has a number for them. */
  user: string;
  rating: number;
  /** e.g. "Feb 2007". */
  date: string;
  body: MarkupNode[];
}

/** What the popup's header shows. */
export interface PageHeader {
  kind: LookupKind;
  name: string;
  /** 0 poor … 5 legendary, 6 artifact, 7 heirloom, as in the game; quests are 1. */
  quality: number;
  /** The icon's file name on Wowhead's image server, e.g. "inv_axe_60" or "quest-start", or "". */
  icon: string;
}

export interface ItemInfo extends PageHeader {
  kind: 'item';
  sections: SourceSection[];
  comments: ItemComment[];
  /** Top-level comments on the page, of which `comments` are the best few. */
  commentTotal: number;
}

/** One quest of a chain step, and whether it's the quest on show. */
export interface ChainQuest {
  /** Wowhead's quest ID; 0 when the page links none. */
  id: number;
  name: string;
  current: boolean;
}

/** One step of a quest chain: its number, and its quests (more than one where the chain branches). */
export interface ChainStep {
  position: number;
  quests: ChainQuest[];
}

export interface QuestInfo extends PageHeader {
  kind: 'quest';
  /** Wowhead's "Series" box in order, or [] when the quest isn't in a chain. */
  chain: ChainStep[];
  comments: ItemComment[];
  commentTotal: number;
}

export type LookupInfo = ItemInfo | QuestInfo;

/** What the popup shows. */
export type PopupState =
  | { kind: 'loading'; link: WowheadLink }
  | { kind: 'ready'; link: WowheadLink; info: LookupInfo }
  | { kind: 'error'; link: WowheadLink; message: string; header: PageHeader | null };

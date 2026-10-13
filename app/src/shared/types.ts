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
  /** The icon's file name on Wowhead's image server, e.g. "inv_axe_60" or "inv_misc_note_01", or "". */
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

/** A Wowhead guide a quest page links to. */
export interface Guide {
  title: string;
  /** Always on https://www.wowhead.com/. */
  url: string;
}

/** An item a quest gives. */
export interface RewardItem {
  id: number;
  name: string;
  /** 0 poor … 7 heirloom, as in the game. */
  quality: number;
  /** The icon's file name on Wowhead's image server, or "". */
  icon: string;
  count: number;
}
/** What finishing a quest gives, as its Wowhead page lists it. */
export interface QuestRewards {
  /** Items to choose one of. */
  choice: RewardItem[];
  /** Items everyone who finishes it gets. */
  always: RewardItem[];
  /** In copper; 0 for none. */
  money: number;
  /** Experience; 0 for none. */
  xp: number;
  /** The copper paid instead of experience at the level cap; 0 for none. */
  moneyAtCap: number;
  /** Reputation gained (or lost, below 0), by faction name in the page's language. */
  reputation: { faction: string; amount: number }[];
}
export interface QuestInfo extends PageHeader {
  kind: 'quest';
  /** Wowhead's "Series" box in order, or [] when the quest isn't in a chain. */
  chain: ChainStep[];
  /** Wowhead's guides for the quest, at most 3. */
  guides: Guide[];
  /** What it gives, or null when the page lists nothing. */
  rewards: QuestRewards | null;
  comments: ItemComment[];
  commentTotal: number;
}

export interface SpellInfo extends PageHeader {
  kind: 'spell';
  comments: ItemComment[];
  commentTotal: number;
}

export type LookupInfo = ItemInfo | QuestInfo | SpellInfo;

/** What the popup shows: a lookup, and the pages clicked through to reach it. */
export type PopupState = (
  | { kind: 'loading'; link: WowheadLink; /** The page's name when it's already known (a click inside the popup). */ name?: string }
  | { kind: 'ready'; link: WowheadLink; info: LookupInfo }
  | { kind: 'error'; link: WowheadLink; message: string; header: PageHeader | null }
) & {
  /** The names of the pages clicked through to reach this one, oldest first; none for a fresh lookup. */
  trail?: string[];
  /** Whether the popup is pinned open (set by the main process). */
  pinned?: boolean;
};

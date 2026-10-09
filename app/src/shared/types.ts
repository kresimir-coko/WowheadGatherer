import type { WowheadLink } from './wowheadLink';

/** One line of a section: who or what, and the details after it. */
export interface SourceRow {
  name: string;
  /** e.g. ["Karazhan", "18%"], shown joined with " · ". */
  details: string[];
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

export interface ItemHeader {
  name: string;
  /** 0 poor … 5 legendary, 6 artifact, 7 heirloom, as in the game. */
  quality: number;
  /** The icon's file name on Wowhead's image server, e.g. "inv_axe_60", or "". */
  icon: string;
}

export interface ItemInfo extends ItemHeader {
  sections: SourceSection[];
  comments: ItemComment[];
  /** Top-level comments on the page, of which `comments` are the best few. */
  commentTotal: number;
}

/** What the popup shows. */
export type PopupState =
  | { kind: 'loading'; link: WowheadLink }
  | { kind: 'ready'; link: WowheadLink; info: ItemInfo }
  | { kind: 'error'; link: WowheadLink; message: string; header: ItemHeader | null };

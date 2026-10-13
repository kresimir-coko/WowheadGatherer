/** What a Wowhead link points at. */
export type LookupKind = 'item' | 'quest' | 'spell';

/** A Wowhead address the add-on copied, e.g. https://www.wowhead.com/tbc/de/item=19019, …/tbc/quest=10482 or …/tbc/spell=27019. */
export interface WowheadLink {
  /** The address, rebuilt with nothing after the ID. */
  url: string;
  /** Wowhead's game path: "tbc", "forever", or "" for retail. */
  site: string;
  /** Wowhead's language path: "de", "fr", … or "" for English. */
  lang: string;
  kind: LookupKind;
  id: number;
}

/** The language paths Wowhead accepts after the game path (the add-on's Url.lua uses the same). */
const LANGUAGES = new Set(['de', 'es', 'mx', 'fr', 'it', 'pt', 'ru', 'ko', 'cn', 'tw']);

/** The longest clipboard text worth reading, in characters; a link is far shorter. */
const MAX_LINK_LENGTH = 300;

const LINK = /^https:\/\/www\.wowhead\.com\/(?:([a-z-]+)\/)?(?:([a-z]{2})\/)?(item|quest|spell)=(\d+)(?:[/?#]\S*)?$/;

/** Reads a Wowhead item, quest or spell link, or returns null for anything else. */
export function parseWowheadLink(text: string): WowheadLink | null {
  if (text.length > MAX_LINK_LENGTH) return null;
  const match = LINK.exec(text.trim());
  if (!match) return null;
  let site = match[1] ?? '';
  let lang = match[2] ?? '';
  // Retail links have only a language: /de/item=19019.
  if (!lang && LANGUAGES.has(site)) {
    lang = site;
    site = '';
  }
  if (lang && !LANGUAGES.has(lang)) return null;
  const kind = match[3] as LookupKind;
  const id = Number(match[4]);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const path = [site, lang].filter(Boolean).map((part) => `${part}/`).join('');
  return { url: `https://www.wowhead.com/${path}${kind}=${id}`, site, lang, kind, id };
}

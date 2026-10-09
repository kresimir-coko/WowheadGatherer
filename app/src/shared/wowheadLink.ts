/** A Wowhead item address the add-on copied, e.g. https://www.wowhead.com/tbc/de/item=19019. */
export interface WowheadLink {
  /** The address, rebuilt with nothing after the item ID. */
  url: string;
  /** Wowhead's game path: "tbc", "forever", or "" for retail. */
  site: string;
  /** Wowhead's language path: "de", "fr", … or "" for English. */
  lang: string;
  itemId: number;
}

/** The language paths Wowhead accepts after the game path (the add-on's Url.lua uses the same). */
const LANGUAGES = new Set(['de', 'es', 'mx', 'fr', 'it', 'pt', 'ru', 'ko', 'cn', 'tw']);

/** The longest clipboard text worth reading, in characters; a link is far shorter. */
const MAX_LINK_LENGTH = 300;

const LINK = /^https:\/\/www\.wowhead\.com\/(?:([a-z-]+)\/)?(?:([a-z]{2})\/)?item=(\d+)(?:[/?#]\S*)?$/;

/** Reads a Wowhead item link, or returns null for anything else. */
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
  const itemId = Number(match[3]);
  if (!Number.isSafeInteger(itemId) || itemId <= 0) return null;
  const path = [site, lang].filter(Boolean).map((part) => `${part}/`).join('');
  return { url: `https://www.wowhead.com/${path}item=${itemId}`, site, lang, itemId };
}

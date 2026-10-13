/** What a Wowhead link points at. */
export type LookupKind = 'item' | 'quest' | 'spell';

/** One quest of a chain the add-on read from Questie and put after "#chain=". */
export interface ChainEntry {
  id: number;
  name: string;
}

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
  /** The quest's whole chain from Questie, when the add-on had one. */
  chain?: ChainEntry[];
}

/** The language paths Wowhead accepts after the game path (the add-on's Url.lua uses the same). */
const LANGUAGES = new Set(['de', 'es', 'mx', 'fr', 'it', 'pt', 'ru', 'ko', 'cn', 'tw']);

/** The longest clipboard text worth reading, in characters; a link with a long quest chain fits easily. */
const MAX_LINK_LENGTH = 6000;
/** At most this many quests of a chain are read (25 before, the quest, 25 after), and names this long. */
const MAX_CHAIN = 51;
const MAX_CHAIN_NAME = 100;

const LINK = /^https:\/\/www\.wowhead\.com\/(?:([a-z-]+)\/)?(?:([a-z]{2})\/)?(item|quest|spell)=(\d+)([/?#]\S*)?$/;
const CHAIN = /#chain=([^#\s]*)$/;

/** The quests after "#chain=" (id~percent-encoded name, joined by "."); broken entries are skipped. */
function readChain(tail: string | undefined): ChainEntry[] | undefined {
  const match = tail ? CHAIN.exec(tail) : null;
  if (!match) return undefined;
  const entries: ChainEntry[] = [];
  for (const part of match[1].split('.').slice(0, MAX_CHAIN)) {
    const split = part.indexOf('~');
    const id = Number(part.slice(0, split));
    if (split <= 0 || !Number.isSafeInteger(id) || id <= 0) continue;
    let name: string;
    try {
      name = decodeURIComponent(part.slice(split + 1)).trim().slice(0, MAX_CHAIN_NAME);
    } catch {
      continue;
    }
    if (name) entries.push({ id, name });
  }
  return entries.length > 1 ? entries : undefined;
}

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
  const link: WowheadLink = { url: `https://www.wowhead.com/${path}${kind}=${id}`, site, lang, kind, id };
  const chain = kind === 'quest' ? readChain(match[5]) : undefined;
  if (chain) link.chain = chain;
  return link;
}

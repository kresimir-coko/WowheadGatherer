/** One thing a Wowhead page mentions: its name, and for items their quality and icon. */
export interface GathererEntry {
  name: string;
  quality?: number;
  icon?: string;
}

/** Wowhead's type number (1 NPC, 2 object, 3 item, 5 quest, 6 spell, 7 zone) → ID → entry. */
export type GathererData = Map<number, Map<number, GathererEntry>>;

/** One row of a Listview table, as Wowhead wrote it. */
export type ListviewRow = Record<string, unknown>;

export interface RawComment {
  body: string;
  rating: number;
  date: string;
  user: string;
  /** 0 for a top-level comment, more for replies. */
  indent: number;
  sticky: boolean;
  deleted: boolean;
}

/** What an item page's inline scripts hold. */
export interface ItemPage {
  gatherer: GathererData;
  /** Listview tables by their ID, e.g. "dropped-by". */
  listviews: Map<string, ListviewRow[]>;
  comments: RawComment[];
}

const GATHERER_CALL = /WH\.Gatherer\.addData\((\d+),\s*\d+,\s*\{/g;
const LISTVIEW_CALL = /new Listview\(\s*\{/g;
// The key must start the property, so "parentid" or "metadata" don't count.
const LISTVIEW_ID = /(?:^|[\s,{])["']?id["']?\s*:\s*["']([^"']+)["']/;
const LISTVIEW_DATA = /(?:^|[\s,{])["']?data["']?\s*:\s*\[/;
const COMMENTS = /var lv_comments0 = \[/;

/**
 * Returns the JSON or JavaScript array or object starting at text[start] (a "[" or "{"),
 * or null when it never closes. Brackets inside quoted strings don't count.
 */
export function sliceBracketed(text: string, start: number): string | null {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '[' || c === '{') {
      depth++;
    } else if (c === ']' || c === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parseJson(text: string | null): unknown {
  if (text === null) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readGatherer(html: string): GathererData {
  const data: GathererData = new Map();
  for (const match of html.matchAll(GATHERER_CALL)) {
    const entries = parseJson(sliceBracketed(html, (match.index ?? 0) + match[0].length - 1));
    if (!isObject(entries)) continue;
    const type = Number(match[1]);
    const byId = data.get(type) ?? new Map<number, GathererEntry>();
    data.set(type, byId);
    for (const [id, raw] of Object.entries(entries)) {
      if (!isObject(raw) || byId.has(Number(id))) continue;
      // Names are keyed by language, e.g. name_enus or name_dede.
      const nameKey = Object.keys(raw).find((key) => key.startsWith('name_')) ?? 'name';
      const name = raw[nameKey];
      if (typeof name !== 'string') continue;
      byId.set(Number(id), {
        name,
        quality: typeof raw.quality === 'number' ? raw.quality : undefined,
        icon: typeof raw.icon === 'string' ? raw.icon : undefined,
      });
    }
  }
  return data;
}

function readListviews(html: string): Map<string, ListviewRow[]> {
  const listviews = new Map<string, ListviewRow[]>();
  const calls = [...html.matchAll(LISTVIEW_CALL)];
  calls.forEach((match, i) => {
    // Look only up to the next Listview, so one table can't take another's data.
    const braceAt = (match.index ?? 0) + match[0].length - 1;
    const end = calls[i + 1]?.index ?? html.length;
    const options = sliceBracketed(html.slice(braceAt, end), 0);
    if (options === null) return;
    const dataAt = LISTVIEW_DATA.exec(options);
    // Comments, screenshots and videos fill themselves in later; they have no data here.
    if (!dataAt) return;
    const id = LISTVIEW_ID.exec(options.slice(0, dataAt.index))?.[1];
    const rows = parseJson(sliceBracketed(options, dataAt.index + dataAt[0].length - 1));
    if (id && Array.isArray(rows) && !listviews.has(id)) {
      listviews.set(id, rows.filter(isObject));
    }
  });
  return listviews;
}

function readComments(html: string): RawComment[] {
  const match = COMMENTS.exec(html);
  if (!match) return [];
  const rows = parseJson(sliceBracketed(html, match.index + match[0].length - 1));
  if (!Array.isArray(rows)) return [];
  return rows.filter(isObject).map((row) => ({
    body: typeof row.body === 'string' ? row.body : '',
    rating: typeof row.rating === 'number' ? row.rating : 0,
    date: typeof row.date === 'string' ? row.date : '',
    user: typeof row.user === 'string' ? row.user : '',
    indent: typeof row.indent === 'number' ? row.indent : 0,
    sticky: Boolean(row.sticky),
    deleted: Boolean(row.deleted),
  }));
}

/**
 * Whether html is a whole Wowhead item or quest page. The page's Gatherer data comes
 * well before its Listview tables, so a page read while the browser is still parsing
 * it has the one without the other; every item and quest page has Listviews.
 */
export function isCompletePage(html: string): boolean {
  return html.includes('WH.Gatherer.addData(') && html.includes('new Listview(');
}

/** Reads the data a Wowhead item page carries in its inline scripts. */
export function parseItemPage(html: string): ItemPage {
  return { gatherer: readGatherer(html), listviews: readListviews(html), comments: readComments(html) };
}

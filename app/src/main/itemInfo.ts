import { formatMoney } from '../shared/money';
import type { ItemInfo, SourceRow, SourceSection } from '../shared/types';
import { pickComments } from './comments';
import type { NameLookup } from './markup';
import type { GathererData, ItemPage, ListviewRow } from './wowheadPage';
import type { ZoneNames } from './zones';

/** Rows shown per section; the rest are left to Wowhead ("+N more on Wowhead"). */
export const ROWS_PER_SECTION = 5;
/** Rows Wowhead saw fewer times than this sort last, so "2 of 2 kills" doesn't top the list. */
export const MIN_SAMPLE = 20;
/** Zones named per row; more show as "+N". */
const ZONES_PER_ROW = 2;

type RowStyle = 'chance' | 'vendor' | 'quest' | 'crafted';

/** The source tables shown, in order, by Wowhead's Listview IDs. Other tables are skipped. */
const SECTIONS: { title: string; ids: string[]; style: RowStyle }[] = [
  { title: 'Dropped by', ids: ['dropped-by'], style: 'chance' },
  { title: 'Sold by', ids: ['sold-by'], style: 'vendor' },
  { title: 'Quest reward', ids: ['reward-from-q'], style: 'quest' },
  { title: 'Crafted with', ids: ['created-by-spell'], style: 'crafted' },
  { title: 'Contained in', ids: ['contained-in-item', 'contained-in-object'], style: 'chance' },
  { title: 'Mined from', ids: ['mined-from-object'], style: 'chance' },
  // These two IDs aren't confirmed yet (Task 10 checks them in game).
  { title: 'Gathered from', ids: ['gathered-from-object'], style: 'chance' },
  { title: 'Skinned from', ids: ['skinned-from'], style: 'chance' },
  { title: 'Fished in', ids: ['fished-in'], style: 'chance' },
  { title: 'Pickpocketed from', ids: ['pick-pocketed-from'], style: 'chance' },
];

/** Wowhead's type numbers for the tags comments use. */
const TYPE_NUMBERS: Record<string, number> = { npc: 1, object: 2, item: 3, quest: 5, spell: 6, zone: 7 };

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** "18%" for 327 of 1822; null when Wowhead has no count. */
export function formatChance(count: unknown, outof: unknown): string | null {
  const seen = num(count);
  const of = num(outof);
  if (seen === undefined || of === undefined || seen <= 0 || of <= 0) return null;
  const percent = Math.min((seen * 100) / of, 100);
  if (percent >= 10) return `${Math.round(percent)}%`;
  if (percent >= 1) return `${percent.toFixed(1)}%`;
  if (percent >= 0.01) return `${percent.toFixed(2)}%`;
  return '<0.01%';
}

function chanceKey(row: ListviewRow): [number, number, number] {
  const count = num(row.count) ?? 0;
  const outof = num(row.outof) ?? 0;
  const percent = count > 0 && outof > 0 ? (count * 100) / outof : -1;
  return [outof >= MIN_SAMPLE ? 0 : 1, -percent, -count];
}

function byChance(a: ListviewRow, b: ListviewRow): number {
  const [aSample, aPercent, aCount] = chanceKey(a);
  const [bSample, bPercent, bCount] = chanceKey(b);
  return aSample - bSample || aPercent - bPercent || aCount - bCount || String(a.name).localeCompare(String(b.name));
}

function itemName(id: number, gatherer: GathererData): string {
  return gatherer.get(3)?.get(id)?.name ?? `item ${id}`;
}

/** "3 × Netherweave Cloth" for each [itemId, count] pair Wowhead lists. */
function itemCounts(pairs: unknown, gatherer: GathererData): string[] {
  if (!Array.isArray(pairs)) return [];
  return pairs.flatMap((pair) => {
    if (!Array.isArray(pair)) return [];
    const id = num(pair[0]);
    const count = num(pair[1]);
    return id === undefined || count === undefined ? [] : [`${count} × ${itemName(id, gatherer)}`];
  });
}

function zoneText(row: ListviewRow, zones: ZoneNames): string | null {
  if (!Array.isArray(row.location)) return null;
  const names = [...new Set(row.location.flatMap((id) => {
    const name = typeof id === 'number' && id > 0 ? zones.get(id) : undefined;
    return name === undefined ? [] : [name];
  }))];
  if (names.length === 0) return null;
  const shown = names.slice(0, ZONES_PER_ROW).join(', ');
  return names.length > ZONES_PER_ROW ? `${shown} +${names.length - ZONES_PER_ROW}` : shown;
}

/** A vendor's price. Wowhead writes it as [[copper, currencies, [[itemId, count], ...]]]. */
function costText(cost: unknown, gatherer: GathererData): string | null {
  if (!Array.isArray(cost) || !Array.isArray(cost[0])) return null;
  const [copper, , items] = cost[0] as unknown[];
  const parts: string[] = [];
  const money = num(copper);
  if (money !== undefined && money > 0) parts.push(formatMoney(money));
  parts.push(...itemCounts(items, gatherer));
  return parts.length > 0 ? parts.join(' + ') : null;
}

/** "Alliance" or "Horde" when only one side can deal with them. Wowhead's react is [alliance, horde], 1 = friendly. */
function factionText(react: unknown): string | null {
  if (!Array.isArray(react)) return null;
  const alliance = react[0] === 1;
  const horde = react[1] === 1;
  if (alliance && !horde) return 'Alliance';
  if (horde && !alliance) return 'Horde';
  return null;
}

/** A quest's side: 1 Alliance, 2 Horde, 3 both. */
function sideText(side: unknown): string | null {
  if (side === 1) return 'Alliance';
  if (side === 2) return 'Horde';
  return null;
}

function toRow(row: ListviewRow, style: RowStyle, page: ItemPage, zones: ZoneNames): SourceRow | null {
  if (typeof row.name !== 'string' || row.name === '') return null;
  let details: (string | null)[] = [];
  switch (style) {
    case 'chance':
      details = [zoneText(row, zones), formatChance(row.count, row.outof)];
      break;
    case 'vendor':
      details = [zoneText(row, zones), costText(row.cost, page.gatherer), factionText(row.react)];
      break;
    case 'quest':
      details = [num(row.level) ? `Level ${row.level}` : null, sideText(row.side)];
      break;
    case 'crafted': {
      const reagents = itemCounts(row.reagents, page.gatherer);
      details = [reagents.length > 0 ? reagents.join(', ') : null];
      break;
    }
  }
  return { name: row.name, details: details.filter((detail): detail is string => detail !== null) };
}

function buildSections(page: ItemPage, zones: ZoneNames): SourceSection[] {
  const sections: SourceSection[] = [];
  for (const { title, ids, style } of SECTIONS) {
    const rows = ids.flatMap((id) => page.listviews.get(id) ?? []);
    if (rows.length === 0) continue;
    // Vendors, quests and recipes keep Wowhead's order.
    const ordered = style === 'chance' ? [...rows].sort(byChance) : rows;
    const shown = ordered
      .map((row) => toRow(row, style, page, zones))
      .filter((row): row is SourceRow => row !== null)
      .slice(0, ROWS_PER_SECTION);
    sections.push({ title, rows: shown, total: rows.length });
  }
  return sections;
}

/** Names for the [item=…]-style tags in comments: from the page's own data, and the zone list. */
export function pageNames(page: ItemPage, zones: ZoneNames): NameLookup {
  return (type, id) =>
    (type === 'zone' ? zones.get(id) : undefined) ?? page.gatherer.get(TYPE_NUMBERS[type] ?? -1)?.get(id)?.name;
}

/** Everything the popup shows for an item, or null when the page doesn't have the item's data. */
export function buildItemInfo(itemId: number, page: ItemPage, zones: ZoneNames): ItemInfo | null {
  const item = page.gatherer.get(3)?.get(itemId);
  if (!item) return null;
  const { comments, total } = pickComments(page, pageNames(page, zones));
  return {
    kind: 'item',
    name: item.name,
    quality: item.quality ?? 1,
    icon: item.icon ?? '',
    sections: buildSections(page, zones),
    comments,
    commentTotal: total,
  };
}

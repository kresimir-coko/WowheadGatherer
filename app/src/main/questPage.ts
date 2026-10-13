import type { ChainQuest, ChainStep } from '../shared/types';
import { decodeEntities } from './markup';
import { isObject, jsonAt, parseItemPage, type ItemPage } from './wowheadPage';

/** What a Wowhead quest page holds that the popup shows. */
export interface QuestPage {
  /** The page heading: the quest's name in the page's language, or null. */
  name: string | null;
  /** The "Series" box's steps in order, or [] when the page has none. */
  chain: ChainStep[];
  /** The Gatherer data and comments, read as on item pages. */
  data: ItemPage;
  /** Each quest's details by ID ($.extend(g_quests[id], {…})): its rewards, experience, money. */
  details: Map<number, Record<string, unknown>>;
  /** Faction names by ID, as the page links them, in its language. */
  factions: Map<number, string>;
  /** The copper the quest pays instead of experience at the level cap, or 0. */
  moneyAtCap: number;
}

const QUEST_DETAILS = /\$\.extend\(g_quests\[(\d+)\],\s*\{/g;
const SCALING_REWARDS = /WH\.Wow\.Quest\.setupScalingRewards\(\s*\{/;
const FACTION_LINK = /<a href="[^"]*\bfaction=(\d+)[^"]*">([^<]+)<\/a>/g;

const HEADING = /<h1 class="heading-size-1">([\s\S]*?)<\/h1>/;
const SERIES = /<table class="series">([\s\S]*?)<\/table>/;
// A step is "<tr><th>2.</th><td>…</td></tr>"; each <div> in the cell is one quest.
const STEP = /<tr>\s*<th>\s*(\d+)\.?\s*<\/th>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g;
const STEP_QUEST = /<div>([\s\S]*?)<\/div>/g;
const LINE_BREAK = /<br\s*\/?>/i;
const TAG = /<[^>]*>/g;
const QUEST_HREF = /href="[^"]*\/quest=(\d+)/i;

/** The text in some HTML: tags dropped, entities decoded, spaces tidied. */
function textOf(html: string): string {
  return decodeEntities(html.replace(TAG, '')).replace(/\s+/g, ' ').trim();
}

/** The quest on show is bold; the others are links to their pages, which carry their IDs. */
function readQuest(html: string): ChainQuest {
  const id = Number(QUEST_HREF.exec(html)?.[1] ?? 0);
  return { id, name: textOf(html), current: !/<a\b/i.test(html) && /<b>/i.test(html) };
}

function readChain(html: string): ChainStep[] {
  const series = SERIES.exec(html);
  if (!series) return [];
  const steps: ChainStep[] = [];
  for (const [, position, cell] of series[1].matchAll(STEP)) {
    // A box can hold two versions of a quest, one per line.
    const quests = [...cell.matchAll(STEP_QUEST)]
      .flatMap(([, inner]) => inner.split(LINE_BREAK).map(readQuest))
      .filter((quest) => quest.name !== '');
    if (quests.length > 0) steps.push({ position: Number(position), quests });
  }
  return steps;
}

/** A Wowhead page's heading: the name of what it's about, in the page's language, or null. */
export function readHeading(html: string): string | null {
  const heading = HEADING.exec(html);
  return (heading && textOf(heading[1])) || null;
}

function readDetails(html: string): Map<number, Record<string, unknown>> {
  const details = new Map<number, Record<string, unknown>>();
  for (const match of html.matchAll(QUEST_DETAILS)) {
    const value = jsonAt(html, (match.index ?? 0) + match[0].length - 1);
    if (isObject(value) && !details.has(Number(match[1]))) details.set(Number(match[1]), value);
  }
  return details;
}

function readFactions(html: string): Map<number, string> {
  const factions = new Map<number, string>();
  for (const [, id, name] of html.matchAll(FACTION_LINK)) {
    const text = textOf(name);
    if (text && !factions.has(Number(id))) factions.set(Number(id), text);
  }
  return factions;
}

/** The "rewardAtCap" of the page's level slider: what the quest pays at the cap instead of experience. */
function readMoneyAtCap(html: string): number {
  const match = SCALING_REWARDS.exec(html);
  const scaling = match ? jsonAt(html, match.index + match[0].length - 1) : undefined;
  const coin = isObject(scaling) ? scaling.coin : undefined;
  const atCap = isObject(coin) ? coin.rewardAtCap : undefined;
  return typeof atCap === 'number' && Number.isFinite(atCap) && atCap > 0 ? Math.floor(atCap) : 0;
}

/** Reads a Wowhead quest page: its heading, its chain, its rewards, and the data item pages also have. */
export function parseQuestPage(html: string): QuestPage {
  return {
    name: readHeading(html),
    chain: readChain(html),
    data: parseItemPage(html),
    details: readDetails(html),
    factions: readFactions(html),
    moneyAtCap: readMoneyAtCap(html),
  };
}

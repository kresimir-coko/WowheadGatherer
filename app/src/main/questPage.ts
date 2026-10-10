import type { ChainQuest, ChainStep } from '../shared/types';
import { decodeEntities } from './markup';
import { parseItemPage, type ItemPage } from './wowheadPage';

/** What a Wowhead quest page holds that the popup shows. */
export interface QuestPage {
  /** The page heading: the quest's name in the page's language, or null. */
  name: string | null;
  /** The "Series" box's steps in order, or [] when the page has none. */
  chain: ChainStep[];
  /** The Gatherer data and comments, read as on item pages. */
  data: ItemPage;
}

const HEADING = /<h1 class="heading-size-1">([\s\S]*?)<\/h1>/;
const SERIES = /<table class="series">([\s\S]*?)<\/table>/;
// A step is "<tr><th>2.</th><td>…</td></tr>"; each <div> in the cell is one quest.
const STEP = /<tr>\s*<th>\s*(\d+)\.?\s*<\/th>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g;
const STEP_QUEST = /<div>([\s\S]*?)<\/div>/g;
const TAG = /<[^>]*>/g;

/** The text in some HTML: tags dropped, entities decoded, spaces tidied. */
function textOf(html: string): string {
  return decodeEntities(html.replace(TAG, '')).replace(/\s+/g, ' ').trim();
}

/** The quest on show is bold; the others are links to their pages. */
function readQuest(html: string): ChainQuest {
  return { name: textOf(html), current: !/<a\b/i.test(html) && /<b>/i.test(html) };
}

function readChain(html: string): ChainStep[] {
  const series = SERIES.exec(html);
  if (!series) return [];
  const steps: ChainStep[] = [];
  for (const [, position, cell] of series[1].matchAll(STEP)) {
    const quests = [...cell.matchAll(STEP_QUEST)].map(([, inner]) => readQuest(inner)).filter((quest) => quest.name !== '');
    if (quests.length > 0) steps.push({ position: Number(position), quests });
  }
  return steps;
}

/** Reads a Wowhead quest page: its heading, its chain, and the data item pages also have. */
export function parseQuestPage(html: string): QuestPage {
  const heading = HEADING.exec(html);
  const name = heading ? textOf(heading[1]) : '';
  return { name: name || null, chain: readChain(html), data: parseItemPage(html) };
}

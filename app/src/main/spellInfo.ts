import type { SpellInfo } from '../shared/types';
import { pickComments } from './comments';
import { pageNames } from './itemInfo';
import { readHeading } from './questPage';
import { parseItemPage } from './wowheadPage';
import type { ZoneNames } from './zones';

/** Wowhead's type number for spells in WH.Gatherer.addData. */
const SPELL_TYPE = 6;

/** Everything the popup shows for a spell, or null when the page doesn't have the spell's data. */
export function buildSpellInfo(spellId: number, html: string, zones: ZoneNames): SpellInfo | null {
  const page = parseItemPage(html);
  const spell = page.gatherer.get(SPELL_TYPE)?.get(spellId);
  if (!spell) return null;
  const { comments, total } = pickComments(page, pageNames(page, zones));
  return {
    kind: 'spell',
    // The heading is in the page's language; the Gatherer data can be in English.
    name: readHeading(html) ?? spell.name,
    quality: 1,
    icon: spell.icon ?? '',
    comments,
    commentTotal: total,
  };
}

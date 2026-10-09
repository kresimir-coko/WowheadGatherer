import type { ItemComment } from '../shared/types';
import { parseMarkup, type NameLookup } from './markup';
import type { ItemPage } from './wowheadPage';

/** How many comments the popup shows. */
export const COMMENTS_SHOWN = 3;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2007-02-01T18:19:05-06:00" → "Feb 2007", or "" when it isn't a date. */
export function formatCommentDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** The best few top-level comments (pinned first, then by rating), and how many top-level comments there are. */
export function pickComments(page: ItemPage, nameOf: NameLookup): { comments: ItemComment[]; total: number } {
  const topLevel = page.comments.filter((c) => !c.deleted && c.indent === 0);
  const best = [...topLevel]
    .sort((a, b) => Number(b.sticky) - Number(a.sticky) || b.rating - a.rating)
    .slice(0, COMMENTS_SHOWN);
  return {
    total: topLevel.length,
    comments: best.map((c) => ({
      // Comments from Wowhead's early days only have a number for their author.
      user: /^\d*$/.test(c.user) ? '' : c.user,
      rating: c.rating,
      date: formatCommentDate(c.date),
      body: parseMarkup(c.body, nameOf),
    })),
  };
}

import { describe, expect, it } from 'vitest';
import { formatCommentDate, pickComments } from '../src/main/comments';
import type { NameLookup } from '../src/main/markup';
import { parseItemPage, type ItemPage, type RawComment } from '../src/main/wowheadPage';
import { fixture } from './fixtures';

const none: NameLookup = () => undefined;

function comment(over: Partial<RawComment>): RawComment {
  return { body: 'x', rating: 0, date: '', user: 'someone', indent: 0, sticky: false, deleted: false, ...over };
}

describe('pickComments', () => {
  it('picks the three best top-level comments (Thunderfury)', () => {
    const { comments, total } = pickComments(parseItemPage(fixture('item-19019.html.gz')), none);
    expect(total).toBe(350);
    expect(comments.map((c) => c.rating)).toEqual([522, 283, 262]);
    expect(comments[0]).toMatchObject({ user: 'Koen', date: 'Dec 2006' });
  });

  it('leaves out authors Wowhead only knows by number (Gorehowl)', () => {
    const { comments } = pickComments(parseItemPage(fixture('item-28773.html.gz')), none);
    expect(comments[0]).toMatchObject({ user: '', rating: 300, date: 'Feb 2007' });
  });

  it('puts pinned comments first and skips replies and deleted ones', () => {
    const page: ItemPage = {
      gatherer: new Map(),
      listviews: new Map(),
      comments: [
        comment({ user: 'reply', rating: 999, indent: 1 }),
        comment({ user: 'deleted', rating: 500, deleted: true }),
        comment({ user: 'good', rating: 50 }),
        comment({ user: 'pinned', rating: 1, sticky: true }),
      ],
    };
    const { comments, total } = pickComments(page, none);
    expect(total).toBe(2);
    expect(comments.map((c) => c.user)).toEqual(['pinned', 'good']);
  });
});

describe('formatCommentDate', () => {
  it('gives the month and year', () => {
    expect(formatCommentDate('2007-02-01T18:19:05-06:00')).toBe('Feb 2007');
  });

  it('gives nothing for a bad date', () => {
    expect(formatCommentDate('nonsense')).toBe('');
  });
});

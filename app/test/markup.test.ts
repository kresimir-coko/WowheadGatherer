import { describe, expect, it } from 'vitest';
import { MAX_COMMENT_CHARS, parseMarkup, type NameLookup } from '../src/main/markup';
import { formatMoney } from '../src/shared/money';
import type { MarkupNode } from '../src/shared/types';

const names: NameLookup = (type, id) => (type === 'item' && id === 21877 ? 'Netherweave Cloth' : undefined);
const parse = (body: string) => parseMarkup(body, names);
const text = (value: string): MarkupNode => ({ kind: 'text', text: value });

describe('formatMoney', () => {
  it.each([
    [0, '0c'], [25, '25c'], [100, '1s'], [10000, '1g'], [12345, '1g 23s 45c'], [10050, '1g 50c'], [-5, '0c'], [12.9, '12c'],
  ])('%d copper is %s', (copper, expected) => {
    expect(formatMoney(copper)).toBe(expected);
  });
});

describe('parseMarkup', () => {
  it('keeps plain text', () => {
    expect(parse('Buy it from innkeepers')).toEqual([text('Buy it from innkeepers')]);
  });

  it('turns line breaks into breaks', () => {
    expect(parse('a\r\n\r\nb')).toEqual([text('a'), { kind: 'break' }, { kind: 'break' }, text('b')]);
  });

  it('reads bold and italic', () => {
    expect(parse('[b]bold[/b] and [i]it[/i]')).toEqual([
      { kind: 'bold', children: [text('bold')] }, text(' and '), { kind: 'italic', children: [text('it')] },
    ]);
  });

  it('closes tags left open', () => {
    expect(parse('[b]x [i]y')).toEqual([{ kind: 'bold', children: [text('x '), { kind: 'italic', children: [text('y')] }] }]);
  });

  it('closes inner tags along with their outer one', () => {
    expect(parse('[b][i]x[/b]y')).toEqual([{ kind: 'bold', children: [{ kind: 'italic', children: [text('x')] }] }, text('y')]);
  });

  it('ignores a closing tag with nothing open', () => {
    expect(parse('[/b]x')).toEqual([text('x')]);
  });

  it('names the items it knows and numbers the rest', () => {
    expect(parse('[item=21877] and [npc=999]')).toEqual([text('Netherweave Cloth and NPC 999')]);
  });

  it('keeps link text, not the address', () => {
    expect(parse('[url=https://example.com]a site[/url]')).toEqual([text('a site')]);
  });

  it('shows money', () => {
    expect(parse('[money=12345]')).toEqual([text('1g 23s 45c')]);
  });

  it('reads lists', () => {
    expect(parse('[ul][li]one[/li][li]two[/li][/ul]')).toEqual([
      { kind: 'listItem', children: [text('one')] }, { kind: 'listItem', children: [text('two')] },
    ]);
  });

  it('drops styling tags but keeps their text', () => {
    expect(parse('[color=q3]blue[/color]')).toEqual([text('blue')]);
  });

  it('keeps square brackets that are not Wowhead tags', () => {
    expect(parse('Buy [Hearthstone] now')).toEqual([text('Buy [Hearthstone] now')]);
    expect(parse('[constructor=1]x')).toEqual([text('[constructor=1]x')]);
  });

  it('decodes entities', () => {
    expect(parse('a&nbsp;b &amp; c&#39;s')).toEqual([text("a b & c's")]);
  });

  it('ignores impossible character numbers', () => {
    expect(parse('&#99999999;')).toEqual([text('&#99999999;')]);
  });

  it('keeps HTML as plain text', () => {
    expect(parse('<img src=x onerror=alert(1)>')).toEqual([text('<img src=x onerror=alert(1)>')]);
  });

  it('cuts long comments short', () => {
    expect(parse('x'.repeat(1000))).toEqual([text('x'.repeat(MAX_COMMENT_CHARS) + '…')]);
  });
});

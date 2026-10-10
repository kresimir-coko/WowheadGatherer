import { formatMoney } from '../shared/money';
import type { MarkupContainerKind, MarkupNode } from '../shared/types';

/** Looks up a name for [item=…], [npc=…] and the like, or undefined. */
export type NameLookup = (type: string, id: number) => string | undefined;

/** The most text one comment shows, in characters; Wowhead has the rest. */
export const MAX_COMMENT_CHARS = 600;

/** Tags that wrap text in a style. */
const CONTAINERS = new Map<string, MarkupContainerKind>([
  ['b', 'bold'], ['i', 'italic'], ['u', 'underline'], ['small', 'small'], ['quote', 'quote'], ['li', 'listItem'],
]);
/** Tags that stand for a game object, with the word used when the page doesn't name it. */
const OBJECT_TAGS = new Map<string, string>([
  ['item', 'item'], ['npc', 'NPC'], ['quest', 'quest'], ['spell', 'spell'], ['zone', 'zone'], ['object', 'object'],
]);
/** Wowhead tags that only style or link their text: the tag goes, its text stays. */
const DROPPED_TAGS = new Set([
  'url', 'color', 'ul', 'ol', 'span', 'div', 'table', 'tr', 'td', 'th', 'pad', 'acronym', 'tooltip',
  'icondb', 'icon', 's', 'code', 'center', 'h2', 'h3', 'hr', 'img', 'toggler',
]);
const TAG = /\[(\/?)([a-z0-9]+)(?:=([^\]\s]*))?[^\]]*\]/gi;
const ENTITY = /&(#\d+|#x[0-9a-f]+|[a-z]+);/gi;
const NAMED_ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeEntities(text: string): string {
  return text.replace(ENTITY, (whole, name: string) => {
    const lower = name.toLowerCase();
    if (lower.startsWith('#')) {
      const code = lower.startsWith('#x') ? parseInt(lower.slice(2), 16) : Number(lower.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return Object.hasOwn(NAMED_ENTITIES, lower) ? NAMED_ENTITIES[lower] : whole;
  });
}

/** Reads Wowhead's comment markup into nodes the popup shows as text. */
export function parseMarkup(body: string, nameOf: NameLookup): MarkupNode[] {
  const root: MarkupNode[] = [];
  const stack: { tag: string; children: MarkupNode[] }[] = [{ tag: '', children: root }];
  let budget = MAX_COMMENT_CHARS;
  let full = false;

  const top = () => stack[stack.length - 1];
  const pushText = (value: string) => {
    if (full || value === '') return;
    let piece = value;
    if (piece.length > budget) {
      piece = piece.slice(0, budget).trimEnd() + '…';
      full = true;
    }
    budget -= piece.length;
    const children = top().children;
    const last = children[children.length - 1];
    if (last?.kind === 'text') last.text += piece;
    else children.push({ kind: 'text', text: piece });
  };
  const addText = (raw: string) => {
    decodeEntities(raw).split(/\r?\n/).forEach((line, i) => {
      if (i > 0 && !full) top().children.push({ kind: 'break' });
      pushText(line);
    });
  };

  let at = 0;
  for (const match of body.matchAll(TAG)) {
    const index = match.index ?? 0;
    addText(body.slice(at, index));
    at = index + match[0].length;
    const closing = match[1] === '/';
    const tag = match[2].toLowerCase();
    const value = match[3];
    const container = CONTAINERS.get(tag);

    if (closing) {
      if (container) {
        // Close it, and anything opened inside it; a stray closing tag is ignored.
        const depth = stack.findLastIndex((frame) => frame.tag === tag);
        if (depth > 0) stack.length = depth;
      } else if (!DROPPED_TAGS.has(tag)) {
        addText(match[0]);
      }
      continue;
    }
    if (container) {
      if (full) continue;
      const node = { kind: container, children: [] as MarkupNode[] };
      top().children.push(node);
      stack.push({ tag, children: node.children });
    } else if (OBJECT_TAGS.has(tag) && value && /^\d+$/.test(value)) {
      pushText(nameOf(tag, Number(value)) ?? `${OBJECT_TAGS.get(tag)} ${value}`);
    } else if (tag === 'money' && value && /^\d+$/.test(value)) {
      pushText(formatMoney(Number(value)));
    } else if (!DROPPED_TAGS.has(tag)) {
      // Not a Wowhead tag, e.g. "[Hearthstone]" typed by hand: keep it as written.
      addText(match[0]);
    }
  }
  addText(body.slice(at));
  return root;
}

import type { PageHeader, PopupState } from './types';

/** The name, quality and icon a page's header shows, once a lookup knows them. */
export function headerOf(state: PopupState): PageHeader | null {
  if (state.kind === 'ready') return state.info;
  if (state.kind === 'error') return state.header;
  return null;
}

const KIND_NAMES = { item: 'Item', quest: 'Quest', spell: 'Spell' } as const;

/** What a page is called: the name Wowhead gave it, or "Quest 10482" / "Item 28105" / "Spell 27019" until one is known. */
export function pageName(state: PopupState): string {
  return headerOf(state)?.name ?? `${KIND_NAMES[state.link.kind]} ${state.link.id}`;
}

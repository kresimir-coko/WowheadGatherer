import type { PageHeader, PopupState } from './types';

/** The name, quality and icon a page's header shows, once a lookup knows them. */
export function headerOf(state: PopupState): PageHeader | null {
  if (state.kind === 'ready') return state.info;
  if (state.kind === 'error') return state.header;
  return null;
}

/** What a page is called: the name Wowhead gave it, or "Quest 10482" / "Item 28105" until one is known. */
export function pageName(state: PopupState): string {
  return headerOf(state)?.name ?? `${state.link.kind === 'quest' ? 'Quest' : 'Item'} ${state.link.id}`;
}

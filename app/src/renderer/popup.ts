import type { GathererBridge } from '../preload/preload';
import type { ItemComment, ItemHeader, MarkupNode, PopupState, SourceSection } from '../shared/types';

/** What the popup's buttons do. The preload bridge supplies them in the app. */
export interface PopupActions {
  close(): void;
  openWowhead(): void;
}

declare global {
  interface Window {
    gatherer?: GathererBridge;
  }
}

const ICON_URL = 'https://wow.zamimg.com/images/wow/icons/large/';
/** Icon names are file names like "inv_axe_60"; anything else isn't loaded. */
const ICON_NAME = /^[a-z0-9_-]+$/i;
/** The highest quality with a colour (heirloom). */
const MAX_QUALITY = 7;

const CONTAINER_TAGS = {
  bold: 'strong', italic: 'em', underline: 'u', small: 'small', quote: 'blockquote', listItem: 'div',
} as const;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function headerOf(state: PopupState): ItemHeader | null {
  if (state.kind === 'ready') return state.info;
  if (state.kind === 'error') return state.header;
  return null;
}

function renderHeader(state: PopupState, actions: PopupActions): HTMLElement {
  const header = el('header');
  const item = headerOf(state);
  if (item?.icon && ICON_NAME.test(item.icon)) {
    const icon = el('img', 'icon');
    icon.src = `${ICON_URL}${item.icon.toLowerCase()}.jpg`;
    icon.alt = '';
    header.append(icon);
  }
  const quality = Math.min(Math.max(Math.trunc(item?.quality ?? 1), 0), MAX_QUALITY);
  header.append(el('h1', `q${quality}`, item?.name ?? `Item ${state.link.itemId}`));
  const open = el('button', 'open', 'Open on Wowhead');
  open.addEventListener('click', () => actions.openWowhead());
  const close = el('button', 'close', '×');
  close.title = 'Close (Esc)';
  close.addEventListener('click', () => actions.close());
  header.append(open, close);
  return header;
}

function renderSection(section: SourceSection): HTMLElement {
  const block = el('section');
  block.append(el('h2', undefined, section.title));
  const list = el('ul');
  for (const row of section.rows) {
    const item = el('li');
    item.append(el('span', 'name', row.name));
    if (row.details.length > 0) item.append(el('span', 'details', row.details.join(' · ')));
    list.append(item);
  }
  const hidden = section.total - section.rows.length;
  if (hidden > 0) list.append(el('li', 'more', `+${hidden} more on Wowhead`));
  block.append(list);
  return block;
}

/** Comment nodes as DOM. Text only ever goes in as text. */
export function renderMarkup(nodes: MarkupNode[]): Node[] {
  return nodes.map((node) => {
    if (node.kind === 'text') return document.createTextNode(node.text);
    if (node.kind === 'break') return el('br');
    const container = el(CONTAINER_TAGS[node.kind], node.kind === 'listItem' ? 'list-item' : undefined);
    container.append(...renderMarkup(node.children));
    return container;
  });
}

function renderComment(comment: ItemComment): HTMLElement {
  const block = el('article', 'comment');
  block.append(el('p', 'meta', [`★ ${comment.rating}`, comment.user, comment.date].filter(Boolean).join(' · ')));
  const body = el('div', 'body');
  body.append(...renderMarkup(comment.body));
  block.append(body);
  return block;
}

/** Fills the popup with a state. All of Wowhead's text goes in as text, never as HTML. */
export function renderState(root: HTMLElement, state: PopupState, actions: PopupActions): void {
  root.replaceChildren(renderHeader(state, actions));
  if (state.kind === 'loading') {
    root.append(el('p', 'status', 'Looking it up on Wowhead…'));
    return;
  }
  if (state.kind === 'error') {
    root.append(el('p', 'status error', state.message));
    return;
  }
  const { sections, comments, commentTotal } = state.info;
  root.append(...sections.map(renderSection));
  if (comments.length > 0) {
    const block = el('section', 'comments');
    block.append(el('h2', undefined, `Comments (${commentTotal})`), ...comments.map(renderComment));
    root.append(block);
  }
  if (sections.length === 0 && comments.length === 0) {
    root.append(el('p', 'status', 'Wowhead lists no sources or comments for this item.'));
  }
}

// In the app, the preload script supplies the bridge; tests call renderState directly.
const bridge = window.gatherer;
const root = document.getElementById('popup');
if (bridge && root) {
  bridge.onState((state) => {
    renderState(root, state, bridge);
    // Once laid out, ask the window to fit the content (main keeps it within limits).
    requestAnimationFrame(() => bridge.reportHeight(root.scrollHeight));
  });
}

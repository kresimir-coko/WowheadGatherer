import type { GathererBridge } from '../preload/preload';
import { chainFor } from '../shared/chain';
import { headerOf, pageName } from '../shared/pageName';
import type { ChainStep, Guide, ItemComment, LookupInfo, MarkupNode, PopupState, SourceSection } from '../shared/types';

/** What the popup's buttons and links do. The preload bridge supplies them in the app. */
export interface PopupActions {
  close(): void;
  openWowhead(): void;
  /** Opens a quest the page shows: in its chain, or one an item starts or is needed for. */
  openQuest(id: number): void;
  /** Goes back to the breadcrumb's page at index. */
  goBack(index: number): void;
  /** The content's height changed without a new state ("Show 5 more comments"). */
  resized(): void;
  /** Opens one of the quest's Wowhead guides in the browser, by its place in the list. */
  openGuide(index: number): void;
  /** Pins the popup open while the player plays, or unpins it. */
  setPinned(pinned: boolean): void;
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
/** Comments a page opens with, and how many more each click on the button adds. */
export const FIRST_COMMENTS = 3;
export const MORE_COMMENTS = 5;
/** What an empty page says, by kind. */
const NOTHING_LISTED = {
  item: 'Wowhead lists no sources or comments for this item.',
  quest: 'Wowhead lists no chain or comments for this quest.',
  spell: 'Wowhead lists no comments for this spell.',
} as const;

const CONTAINER_TAGS = {
  bold: 'strong', italic: 'em', underline: 'u', small: 'small', quote: 'blockquote', listItem: 'div',
} as const;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
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
  const quest = (item?.kind ?? state.link.kind) === 'quest';
  const quality = Math.min(Math.max(Math.trunc(item?.quality ?? 1), 0), MAX_QUALITY);
  // Quest names are gold, as in the game's quest log; items take their quality colour.
  header.append(el('h1', quest ? 'quest' : `q${quality}`, pageName(state)));
  const open = el('button', 'open', 'Open on Wowhead');
  open.addEventListener('click', () => actions.openWowhead());
  const close = el('button', 'close', '×');
  close.title = 'Close (Esc)';
  close.addEventListener('click', () => actions.close());
  const pin = el('button', state.pinned ? 'pin pinned' : 'pin', state.pinned ? 'Pinned' : 'Pin');
  pin.title = state.pinned ? 'Unpin: Escape and switching away close it again' : 'Keep it open while you play';
  pin.addEventListener('click', () => actions.setPinned(!state.pinned));
  header.append(open, pin, close);
  return header;
}

/** The pages clicked through to reach this one, each a way back, then this page. */
function renderTrail(state: PopupState, trail: string[], actions: PopupActions): HTMLElement {
  const nav = el('nav', 'trail');
  trail.forEach((name, index) => {
    const crumb = el('button', 'crumb', name);
    crumb.addEventListener('click', () => actions.goBack(index));
    nav.append(crumb, el('span', 'sep', '›'));
  });
  nav.append(el('span', 'here', pageName(state)));
  return nav;
}

/** A quest name the player can click to open it in the popup. */
function questButton(name: string, id: number, actions: PopupActions, className = 'quest-link'): HTMLButtonElement {
  const button = el('button', className, name);
  button.addEventListener('click', () => actions.openQuest(id));
  return button;
}

function renderSection(section: SourceSection, actions: PopupActions): HTMLElement {
  const block = el('section');
  block.append(el('h2', undefined, section.title));
  const list = el('ul');
  for (const row of section.rows) {
    const item = el('li');
    item.append(row.questId ? questButton(row.name, row.questId, actions, 'name quest-link') : el('span', 'name', row.name));
    if (row.details.length > 0) item.append(el('span', 'details', row.details.join(' · ')));
    list.append(item);
  }
  const hidden = section.total - section.rows.length;
  if (hidden > 0) list.append(el('li', 'more', `+${hidden} more on Wowhead`));
  block.append(list);
  return block;
}

function renderChain(chain: ChainStep[], actions: PopupActions): HTMLElement {
  const block = el('section', 'chain');
  block.append(el('h2', undefined, 'Quest chain'));
  const list = el('ul');
  for (const step of chain) {
    const row = el('li');
    const names = el('span', 'name');
    step.quests.forEach((quest, i) => {
      if (i > 0) names.append(' or ');
      const clickable = !quest.current && quest.id > 0;
      names.append(clickable ? questButton(quest.name, quest.id, actions) : el('span', quest.current ? 'current' : undefined, quest.name));
    });
    row.append(el('span', 'position', `${step.position}.`), names);
    list.append(row);
  }
  block.append(list);
  return block;
}

/** Wowhead's guides for the quest, each opening in the browser. */
function renderGuides(guides: Guide[], actions: PopupActions): HTMLElement {
  const block = el('section', 'guides');
  block.append(el('h2', undefined, 'Guides'));
  const list = el('ul');
  guides.forEach((guide, index) => {
    const row = el('li');
    const link = el('button', 'name guide-link', guide.title);
    link.addEventListener('click', () => actions.openGuide(index));
    row.append(link);
    list.append(row);
  });
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

function moreLabel(count: number): string {
  return `Show ${count} more ${count === 1 ? 'comment' : 'comments'}`;
}

/** The best FIRST_COMMENTS comments, and a button that adds MORE_COMMENTS more per click. */
function renderComments(info: LookupInfo, actions: PopupActions): HTMLElement {
  const block = el('section', 'comments');
  const more = el('button', 'more-comments');
  block.append(el('h2', undefined, `Comments (${info.commentTotal})`), more);
  let shown = 0;
  const showNext = (count: number) => {
    const next = info.comments.slice(shown, shown + count);
    more.before(...next.map(renderComment));
    shown += next.length;
    const left = info.comments.length - shown;
    if (left > 0) more.textContent = moreLabel(Math.min(left, MORE_COMMENTS));
    else more.remove();
  };
  showNext(FIRST_COMMENTS);
  more.addEventListener('click', () => {
    showNext(MORE_COMMENTS);
    actions.resized();
  });
  return block;
}

/** Fills the popup with a state. All of Wowhead's text goes in as text, never as HTML. */
export function renderState(root: HTMLElement, state: PopupState, actions: PopupActions): void {
  root.replaceChildren();
  // A new page starts at the top, wherever the last one was scrolled to.
  root.scrollTop = 0;
  // The breadcrumb and the title row stay at the top while the rest scrolls; dragging them moves the popup.
  const top = el('div', 'top');
  if (state.trail && state.trail.length > 0) top.append(renderTrail(state, state.trail, actions));
  top.append(renderHeader(state, actions));
  root.append(top);
  if (state.kind === 'loading') {
    root.append(el('p', 'status', 'Looking it up on Wowhead…'));
    return;
  }
  if (state.kind === 'error') {
    root.append(el('p', 'status error', state.message));
    return;
  }
  const { info } = state;
  if (info.kind === 'item') root.append(...info.sections.map((section) => renderSection(section, actions)));
  const chain = chainFor(state);
  if (chain.length > 0) root.append(renderChain(chain, actions));
  if (info.kind === 'quest' && info.guides.length > 0) root.append(renderGuides(info.guides, actions));
  if (info.comments.length > 0) root.append(renderComments(info, actions));
  const listsNothing = info.kind === 'item' ? info.sections.length === 0
    : info.kind === 'quest' ? chain.length === 0 && info.guides.length === 0 : true;
  if (listsNothing && info.comments.length === 0) root.append(el('p', 'status', NOTHING_LISTED[info.kind]));
}

/** Asks for a re-fit once the page's fonts have loaded: the first popup is laid out with the fallback font. */
export function refitWhenFontsLoad(fonts: { ready: Promise<unknown> } | undefined, resized: () => void): void {
  fonts?.ready.then(resized, () => {});
}

/**
 * The window height that fits the popup: its content plus its own border. scrollHeight
 * alone leaves out the border, and a window that much too short shows a scrollbar.
 */
export function contentHeight(root: HTMLElement): number {
  return root.scrollHeight + (root.offsetHeight - root.clientHeight);
}

// In the app, the preload script supplies the bridge; tests call renderState directly.
const bridge = window.gatherer;
const root = document.getElementById('popup');
if (bridge && root) {
  const actions: PopupActions = {
    close: () => bridge.close(),
    openWowhead: () => bridge.openWowhead(),
    openQuest: (id) => bridge.openQuest(id),
    goBack: (index) => bridge.goBack(index),
    openGuide: (index) => bridge.openGuide(index),
    setPinned: (pinned) => bridge.setPinned(pinned),
    // Once laid out, ask the window to fit the content (main keeps it within limits).
    resized: () => requestAnimationFrame(() => bridge.reportHeight(contentHeight(root))),
  };
  // Load the font now, while the popup is hidden, rather than with the first lookup.
  void document.fonts?.load("14px 'Marcellus'");
  bridge.onState((state) => {
    renderState(root, state, actions);
    actions.resized();
    refitWhenFontsLoad(document.fonts, actions.resized);
  });
}

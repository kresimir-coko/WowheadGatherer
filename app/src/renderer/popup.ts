import type { GathererBridge } from '../preload/preload';
import { chainFor } from '../shared/chain';
import { formatMoney } from '../shared/money';
import { headerOf, pageName } from '../shared/pageName';
import type {
  ChainStep, Guide, ItemComment, LookupInfo, MarkupNode, PopupState, QuestRewards, RewardItem, SourceSection,
} from '../shared/types';

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

/** The class that colours a name by item quality, e.g. "q2" for green. */
function qualityClass(quality: number): string {
  return `q${Math.min(Math.max(Math.trunc(quality), 0), MAX_QUALITY)}`;
}

function iconImage(name: string, className: string): HTMLImageElement | null {
  if (!ICON_NAME.test(name)) return null;
  const icon = el('img', className);
  icon.src = `${ICON_URL}${name.toLowerCase()}.jpg`;
  icon.alt = '';
  return icon;
}

const SVG = 'http://www.w3.org/2000/svg';

/** A pushpin, drawn here: its cap, its body widening to a collar, and its point. */
function pushpin(): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ['M5 1.5h6v2H5z', 'M6.2 3.5h3.6v3.6L12 9.3H4l2.2-2.2z', 'M7.4 9.3h1.2L8 15.5z']) {
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

function renderHeader(state: PopupState, actions: PopupActions): HTMLElement {
  const header = el('header');
  const item = headerOf(state);
  const icon = item?.icon ? iconImage(item.icon, 'icon') : null;
  if (icon) header.append(icon);
  const quest = (item?.kind ?? state.link.kind) === 'quest';
  // Quest names are gold, as in the game's quest log; items take their quality colour.
  header.append(el('h1', quest ? 'quest' : qualityClass(item?.quality ?? 1), pageName(state)));
  const open = el('button', 'open', 'Wowhead');
  open.title = 'Open this page on Wowhead';
  open.addEventListener('click', () => actions.openWowhead());
  const close = el('button', 'close', '×');
  close.title = 'Close (Esc)';
  close.addEventListener('click', () => actions.close());
  const pin = el('button', state.pinned ? 'pin pinned' : 'pin');
  pin.append(pushpin());
  pin.setAttribute('aria-label', state.pinned ? 'Unpin' : 'Pin');
  pin.setAttribute('aria-pressed', String(Boolean(state.pinned)));
  pin.title = state.pinned ? 'Unpin: Escape and switching away close it again' : 'Pin: keep it open while you play';
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

function rewardList(items: RewardItem[]): HTMLElement {
  const list = el('ul');
  for (const item of items) {
    const row = el('li');
    const icon = iconImage(item.icon, 'reward-icon');
    if (icon) row.append(icon);
    row.append(el('span', `name ${qualityClass(item.quality)}`, item.name));
    if (item.count > 1) row.append(el('span', 'details', `×${item.count}`));
    list.append(row);
  }
  return list;
}

/** "9,020 XP (54s at max level) · 90s · +250 Honor Hold", leaving out what the quest doesn't give. */
function gainsText(rewards: QuestRewards): string {
  const parts: string[] = [];
  const atCap = rewards.moneyAtCap > 0 ? `${formatMoney(rewards.moneyAtCap)} at max level` : '';
  if (rewards.xp > 0) parts.push(`${rewards.xp.toLocaleString('en-US')} XP${atCap ? ` (${atCap})` : ''}`);
  else if (atCap) parts.push(atCap);
  if (rewards.money > 0) parts.push(formatMoney(rewards.money));
  for (const { faction, amount } of rewards.reputation) parts.push(`${amount > 0 ? '+' : ''}${amount} ${faction}`);
  return parts.join(' · ');
}

/** What finishing the quest gives: items to choose from, items everyone gets, then the rest on one line. */
function renderRewards(rewards: QuestRewards): HTMLElement {
  const block = el('section', 'rewards');
  block.append(el('h2', undefined, 'Rewards'));
  if (rewards.choice.length > 0) block.append(el('p', 'label', 'Choose one:'), rewardList(rewards.choice));
  if (rewards.always.length > 0) {
    block.append(el('p', 'label', rewards.choice.length > 0 ? 'You also get:' : 'You get:'), rewardList(rewards.always));
  }
  const gains = gainsText(rewards);
  if (gains) block.append(el('p', 'gains', gains));
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
  // Rewards come first, so they're in view while the player clicks through a chain.
  if (info.kind === 'quest' && info.rewards) root.append(renderRewards(info.rewards));
  const chain = chainFor(state);
  if (chain.length > 0) root.append(renderChain(chain, actions));
  if (info.kind === 'quest' && info.guides.length > 0) root.append(renderGuides(info.guides, actions));
  if (info.comments.length > 0) root.append(renderComments(info, actions));
  const listsNothing = info.kind === 'item' ? info.sections.length === 0
    : info.kind === 'quest' ? chain.length === 0 && info.guides.length === 0 && !info.rewards : true;
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

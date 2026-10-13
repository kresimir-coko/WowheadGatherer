import type { LookupInfo, PageHeader, PopupState } from '../shared/types';
import type { LookupKind, WowheadLink } from '../shared/wowheadLink';
import type { DiskCache } from './cache';
import { buildItemInfo } from './itemInfo';
import { buildQuestInfo, QUEST_ICON } from './questInfo';
import { parseQuestPage } from './questPage';
import { buildSpellInfo } from './spellInfo';
import { isCompletePage, parseItemPage } from './wowheadPage';
import { parseZoneNames, type ZoneNames } from './zones';

export interface FetchResult {
  status: number;
  /** The address after any redirects. */
  url: string;
  text: string;
}

export interface ClientDeps {
  /** A GET through the browser's network stack. Rejects when Wowhead can't be reached. */
  fetchText(url: string, headers: Record<string, string>): Promise<FetchResult>;
  /**
   * The page's HTML and final address from a hidden browser window, which passes Wowhead's bot
   * check like any browser; null when that fails too.
   */
  loadInBrowser(url: string): Promise<{ html: string; url: string } | null>;
  cache: DiskCache;
  now?: () => number;
}

/** How long a looked-up page stays fresh, in milliseconds. */
export const PAGE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** How long the zone names stay fresh, in milliseconds. */
export const ZONES_MAX_AGE_MS = 7 * PAGE_MAX_AGE_MS;
/** Bump when what's cached changes shape, so old cache files are left alone. 2: lookups gained `kind`; 3: every comment, quest IDs; 4: quest guides. */
const CACHE_VERSION = 4;

/** Whether a cache file belongs to this version; older ones are deleted at start. */
export function isCurrentCacheFile(fileName: string): boolean {
  return fileName.includes(`-v${CACHE_VERSION}-`);
}

const PAGE_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

export const MESSAGES = {
  notFound: (kind: LookupKind, id: number) => `Wowhead doesn't know ${kind} ${id}.`,
  offline: "Couldn't reach Wowhead. Check your internet connection.",
  blocked: "Wowhead didn't let the app read this page. Open it on Wowhead instead.",
  changed: "Wowhead's page looks different from what the app knows, so it can't read it. Open it on Wowhead instead.",
};

type PageResult = { kind: 'html'; html: string } | { kind: 'not-found' } | { kind: 'offline' } | { kind: 'blocked' };

/** An address on Wowhead's data server, with the link's game and, if asked, its language. */
function netherUrl(link: WowheadLink, path: string, withLanguage: boolean): string {
  const prefix = [link.site, withLanguage ? link.lang : ''].filter(Boolean).map((part) => `${part}/`).join('');
  return `https://nether.wowhead.com/${prefix}${path}`;
}

export class WowheadClient {
  /** Lookups waiting for Wowhead, by cache key: a second lookup of the same page shares the first. */
  private readonly inFlight = new Map<string, Promise<PopupState>>();

  constructor(private readonly deps: ClientDeps) {}

  /** What the popup should show for a link. Never rejects. */
  lookup(link: WowheadLink): Promise<PopupState> {
    const key = `${link.kind}-v${CACHE_VERSION}-${link.site || 'retail'}-${link.lang || 'en'}-${link.id}`;
    const cached = this.deps.cache.get<LookupInfo>(key, PAGE_MAX_AGE_MS, this.now());
    if (cached) return Promise.resolve({ kind: 'ready', link, info: cached });
    // The answer is the same page's; each caller gets it with its own link (and chain).
    const pending = this.inFlight.get(key);
    if (pending) return pending.then((state) => ({ ...state, link }));
    const lookup = this.fetchAndRead(link, key).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, lookup);
    return lookup;
  }

  private async fetchAndRead(link: WowheadLink, key: string): Promise<PopupState> {
    const page = await this.fetchPage(link);
    if (page.kind === 'not-found') {
      return { kind: 'error', link, message: MESSAGES.notFound(link.kind, link.id), header: null };
    }
    if (page.kind === 'html') {
      const { info, zonesKnown } = await this.read(link, page.html);
      if (info) {
        // Without zone names the rows lack their zones; try again next time rather than keep that for a day.
        if (zonesKnown) this.deps.cache.set(key, info, this.now());
        return { kind: 'ready', link, info };
      }
    }
    const message = page.kind === 'offline' ? MESSAGES.offline : page.kind === 'blocked' ? MESSAGES.blocked : MESSAGES.changed;
    return { kind: 'error', link, message, header: await this.header(link) };
  }

  /** Reads a page with the reader for the link's kind; info is null when it doesn't hold what the link points at. */
  private async read(link: WowheadLink, html: string): Promise<{ info: LookupInfo | null; zonesKnown: boolean }> {
    const zones = await this.zoneNames(link);
    const zonesKnown = zones.size > 0;
    if (link.kind === 'quest') return { info: buildQuestInfo(link.id, parseQuestPage(html), zones), zonesKnown };
    if (link.kind === 'spell') return { info: buildSpellInfo(link.id, html, zones), zonesKnown };
    return { info: buildItemInfo(link.id, parseItemPage(html), zones), zonesKnown };
  }

  private async fetchPage(link: WowheadLink): Promise<PageResult> {
    let response: FetchResult;
    try {
      response = await this.deps.fetchText(link.url, PAGE_HEADERS);
    } catch {
      return { kind: 'offline' };
    }
    // Wowhead answers an unknown ID with a 404 and a redirect to its item search.
    if (response.status === 404 || response.url.includes('notFound=')) return { kind: 'not-found' };
    if (response.status === 200 && isCompletePage(response.text)) return { kind: 'html', html: response.text };
    // Anything else is most likely Wowhead's bot check, which a real browser window passes.
    const page = await this.deps.loadInBrowser(link.url);
    // Wowhead sends an unknown ID to its search page, in the window as on the network.
    if (page?.url.includes('notFound=')) return { kind: 'not-found' };
    if (page && isCompletePage(page.html)) return { kind: 'html', html: page.html };
    return { kind: 'blocked' };
  }

  private async zoneNames(link: WowheadLink): Promise<ZoneNames> {
    const key = `zones-v${CACHE_VERSION}-${link.site || 'retail'}`;
    const cached = this.deps.cache.get<[number, string][]>(key, ZONES_MAX_AGE_MS, this.now());
    if (cached) return new Map(cached);
    try {
      const response = await this.deps.fetchText(netherUrl(link, 'data/global', false), {});
      const zones = response.status === 200 ? parseZoneNames(response.text) : new Map<number, string>();
      if (zones.size > 0) this.deps.cache.set(key, [...zones], this.now());
      return zones;
    } catch {
      // Without zone names, rows just leave out where they are.
      return new Map();
    }
  }

  /** The name, quality and icon from Wowhead's tooltip service, for when the page can't be read. */
  private async header(link: WowheadLink): Promise<PageHeader | null> {
    try {
      const response = await this.deps.fetchText(netherUrl(link, `tooltip/${link.kind}/${link.id}`, true), {});
      if (response.status !== 200) return null;
      const data = JSON.parse(response.text) as Record<string, unknown>;
      if (typeof data.name !== 'string') return null;
      return {
        kind: link.kind,
        name: data.name,
        // Only items have a quality; the tooltip service gives spells -1, which would grey their name.
        quality: link.kind === 'item' && typeof data.quality === 'number' ? data.quality : 1,
        // The tooltip service gives quests no icon.
        icon: typeof data.icon === 'string' ? data.icon : link.kind === 'quest' ? QUEST_ICON : '',
      };
    } catch {
      return null;
    }
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }
}

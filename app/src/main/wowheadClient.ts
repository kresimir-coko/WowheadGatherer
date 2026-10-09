import type { ItemHeader, ItemInfo, PopupState } from '../shared/types';
import type { WowheadLink } from '../shared/wowheadLink';
import type { DiskCache } from './cache';
import { buildItemInfo } from './itemInfo';
import { isCompleteItemPage, parseItemPage } from './wowheadPage';
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
  /** The page's HTML from a hidden browser window, which passes Wowhead's bot check like any browser; null when that fails too. */
  loadInBrowser(url: string): Promise<string | null>;
  cache: DiskCache;
  now?: () => number;
}

/** How long a looked-up item stays fresh, in milliseconds. */
export const ITEM_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** How long the zone names stay fresh, in milliseconds. */
export const ZONES_MAX_AGE_MS = 7 * ITEM_MAX_AGE_MS;
/** Bump when ItemInfo changes shape, so old cache files are left alone. */
const CACHE_VERSION = 1;

const PAGE_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

export const MESSAGES = {
  notFound: (itemId: number) => `Wowhead doesn't know item ${itemId}.`,
  offline: "Couldn't reach Wowhead. Check your internet connection.",
  blocked: "Wowhead didn't let the app read this item's page. Open it on Wowhead instead.",
  changed: "Wowhead's page looks different from what the app knows, so it can't read it. Open it on Wowhead instead.",
};

type PageResult = { kind: 'html'; html: string } | { kind: 'not-found' } | { kind: 'offline' } | { kind: 'blocked' };

/** An address on Wowhead's data server, with the link's game and, if asked, its language. */
function netherUrl(link: WowheadLink, path: string, withLanguage: boolean): string {
  const prefix = [link.site, withLanguage ? link.lang : ''].filter(Boolean).map((part) => `${part}/`).join('');
  return `https://nether.wowhead.com/${prefix}${path}`;
}

export class WowheadClient {
  constructor(private readonly deps: ClientDeps) {}

  /** What the popup should show for a link. Never rejects. */
  async lookup(link: WowheadLink): Promise<PopupState> {
    const key = `item-v${CACHE_VERSION}-${link.site || 'retail'}-${link.lang || 'en'}-${link.itemId}`;
    const cached = this.deps.cache.get<ItemInfo>(key, ITEM_MAX_AGE_MS, this.now());
    if (cached) return { kind: 'ready', link, info: cached };

    const page = await this.fetchPage(link);
    if (page.kind === 'not-found') {
      return { kind: 'error', link, message: MESSAGES.notFound(link.itemId), header: null };
    }
    if (page.kind === 'html') {
      const info = buildItemInfo(link.itemId, parseItemPage(page.html), await this.zoneNames(link));
      if (info) {
        this.deps.cache.set(key, info, this.now());
        return { kind: 'ready', link, info };
      }
    }
    const message = page.kind === 'offline' ? MESSAGES.offline : page.kind === 'blocked' ? MESSAGES.blocked : MESSAGES.changed;
    return { kind: 'error', link, message, header: await this.header(link) };
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
    if (response.status === 200 && isCompleteItemPage(response.text)) return { kind: 'html', html: response.text };
    // Anything else is most likely Wowhead's bot check, which a real browser window passes.
    const html = await this.deps.loadInBrowser(link.url);
    if (html !== null && isCompleteItemPage(html)) return { kind: 'html', html };
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

  /** The item's name, quality and icon from Wowhead's tooltip service, for when its page can't be read. */
  private async header(link: WowheadLink): Promise<ItemHeader | null> {
    try {
      const response = await this.deps.fetchText(netherUrl(link, `tooltip/item/${link.itemId}`, true), {});
      if (response.status !== 200) return null;
      const data = JSON.parse(response.text) as Record<string, unknown>;
      if (typeof data.name !== 'string') return null;
      return {
        name: data.name,
        quality: typeof data.quality === 'number' ? data.quality : 1,
        icon: typeof data.icon === 'string' ? data.icon : '',
      };
    } catch {
      return null;
    }
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }
}

/** Rejects with an Error when the promise takes longer than ms milliseconds. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms} ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

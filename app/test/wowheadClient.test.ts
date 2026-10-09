import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { DiskCache } from '../src/main/cache';
import { ITEM_MAX_AGE_MS, MESSAGES, WowheadClient, withTimeout, type FetchResult } from '../src/main/wowheadClient';
import { parseWowheadLink, type WowheadLink } from '../src/shared/wowheadLink';
import { fixture } from './fixtures';

function link(url: string): WowheadLink {
  const parsed = parseWowheadLink(url);
  if (!parsed) throw new Error(url);
  return parsed;
}

const GOREHOWL = link('https://www.wowhead.com/tbc/item=28773');
const ORE = link('https://www.wowhead.com/tbc/item=23424');
const GERMAN = link('https://www.wowhead.com/tbc/de/item=28773');
const ZONES_URL = 'https://nether.wowhead.com/tbc/data/global';
const TOOLTIP_URL = 'https://nether.wowhead.com/tbc/tooltip/item/28773';
const GERMAN_TOOLTIP_URL = 'https://nether.wowhead.com/tbc/de/tooltip/item/28773';

const ok = (url: string, text: string): FetchResult => ({ status: 200, url, text });
const blocked = (url: string): FetchResult => ({ status: 403, url, text: '<h1>403 ERROR</h1> Request blocked.' });
const gorehowlPage = () => ok(`${GOREHOWL.url}/gorehowl`, fixture('item-28773.html.gz'));
const zones = () => ok(ZONES_URL, fixture('global-tbc.js.gz'));
const tooltip = () => ok(TOOLTIP_URL, fixture('tooltip-28773.json'));

/** A client on a fake network: address → answer. Addresses it doesn't know fail like an offline network. */
function setup(answers: Record<string, FetchResult>, browserHtml: string | null = null, now?: () => number) {
  const asked: string[] = [];
  const fetchText = vi.fn(async (url: string) => {
    asked.push(url);
    const answer = answers[url];
    if (!answer) throw new Error(`offline: ${url}`);
    return answer;
  });
  const loadInBrowser = vi.fn(async (_url: string) => browserHtml);
  const cache = new DiskCache(mkdtempSync(path.join(tmpdir(), 'whg-client-')));
  return { client: new WowheadClient({ fetchText, loadInBrowser, cache, now }), asked, loadInBrowser };
}

describe('WowheadClient', () => {
  it('reads the item page', async () => {
    const { client } = setup({ [GOREHOWL.url]: gorehowlPage(), [ZONES_URL]: zones() });
    const state = await client.lookup(GOREHOWL);
    if (state.kind !== 'ready') throw new Error(state.kind);
    expect(state.info.name).toBe('Gorehowl');
    expect(state.info.sections[0].rows[0]).toEqual({ name: 'Prince Malchezaar', details: ['Karazhan', '18%'] });
  });

  it('remembers an item for a day', async () => {
    const { client, asked } = setup({ [GOREHOWL.url]: gorehowlPage(), [ZONES_URL]: zones() });
    await client.lookup(GOREHOWL);
    asked.length = 0;
    expect((await client.lookup(GOREHOWL)).kind).toBe('ready');
    expect(asked).toEqual([]);
  });

  it('asks again after a day', async () => {
    let time = 0;
    const { client, asked } = setup({ [GOREHOWL.url]: gorehowlPage(), [ZONES_URL]: zones() }, null, () => time);
    await client.lookup(GOREHOWL);
    time = ITEM_MAX_AGE_MS + 1;
    asked.length = 0;
    await client.lookup(GOREHOWL);
    expect(asked).toContain(GOREHOWL.url);
  });

  it('says when Wowhead does not know the item', async () => {
    const notFound = { status: 404, url: 'https://www.wowhead.com/tbc/items?notFound=28773', text: fixture('item-999999.html.gz') };
    const { client } = setup({ [GOREHOWL.url]: notFound });
    expect(await client.lookup(GOREHOWL)).toEqual({ kind: 'error', link: GOREHOWL, message: MESSAGES.notFound(28773), header: null });
  });

  it('falls back to a browser window when Wowhead blocks the request', async () => {
    const { client, loadInBrowser } = setup({ [GOREHOWL.url]: blocked(GOREHOWL.url), [ZONES_URL]: zones() }, fixture('item-28773.html.gz'));
    expect((await client.lookup(GOREHOWL)).kind).toBe('ready');
    expect(loadInBrowser).toHaveBeenCalledWith(GOREHOWL.url);
  });

  it('falls back to a browser window when Wowhead answers with its bot check (202)', async () => {
    const challenge = { status: 202, url: GOREHOWL.url, text: '<script src="https://x.awswaf.com/challenge.js"></script>' };
    const { client } = setup({ [GOREHOWL.url]: challenge, [ZONES_URL]: zones() }, fixture('item-28773.html.gz'));
    expect((await client.lookup(GOREHOWL)).kind).toBe('ready');
  });

  it("shows the tooltip service's name and icon when the page stays blocked", async () => {
    const { client } = setup({ [GOREHOWL.url]: blocked(GOREHOWL.url), [TOOLTIP_URL]: tooltip() });
    expect(await client.lookup(GOREHOWL)).toEqual({
      kind: 'error', link: GOREHOWL, message: MESSAGES.blocked, header: { name: 'Gorehowl', quality: 4, icon: 'inv_axe_60' },
    });
  });

  it('says when Wowhead cannot be reached', async () => {
    const { client } = setup({});
    expect(await client.lookup(GOREHOWL)).toEqual({ kind: 'error', link: GOREHOWL, message: MESSAGES.offline, header: null });
  });

  it('says when the page no longer holds the item', async () => {
    const changed = ok(GOREHOWL.url, 'WH.Gatherer.addData(3, 5, {"1":{"name_enus":"Something else"}});');
    const { client } = setup({ [GOREHOWL.url]: changed, [ZONES_URL]: zones(), [TOOLTIP_URL]: tooltip() });
    expect(await client.lookup(GOREHOWL)).toMatchObject({ kind: 'error', message: MESSAGES.changed, header: { name: 'Gorehowl' } });
  });

  it('still lists sources when the zone names are missing', async () => {
    const { client } = setup({ [GOREHOWL.url]: gorehowlPage() });
    const state = await client.lookup(GOREHOWL);
    if (state.kind !== 'ready') throw new Error(state.kind);
    expect(state.info.sections[0].rows[0].details).toEqual(['18%']);
  });

  it('fetches the zone names once for many items', async () => {
    const { client, asked } = setup({
      [GOREHOWL.url]: gorehowlPage(), [ORE.url]: ok(ORE.url, fixture('item-23424.html.gz')), [ZONES_URL]: zones(),
    });
    await client.lookup(GOREHOWL);
    await client.lookup(ORE);
    expect(asked.filter((url) => url === ZONES_URL)).toHaveLength(1);
  });

  it('keeps languages apart: a German link fetches the German page', async () => {
    const { client, asked } = setup({
      [GOREHOWL.url]: gorehowlPage(), [GERMAN.url]: ok(GERMAN.url, fixture('item-28773.html.gz')), [ZONES_URL]: zones(),
    });
    await client.lookup(GOREHOWL);
    await client.lookup(GERMAN);
    expect(asked).toContain(GERMAN.url);
  });

  it('asks the tooltip service in the link language', async () => {
    const { client } = setup({
      [GERMAN.url]: blocked(GERMAN.url),
      [GERMAN_TOOLTIP_URL]: ok(GERMAN_TOOLTIP_URL, '{"name":"Blutschrei","quality":4,"icon":"inv_axe_60"}'),
    });
    expect(await client.lookup(GERMAN)).toMatchObject({ header: { name: 'Blutschrei' } });
  });
});

describe('withTimeout', () => {
  it('passes the answer through', async () => {
    expect(await withTimeout(Promise.resolve(5), 100)).toBe(5);
  });

  it('gives up after the time', async () => {
    vi.useFakeTimers();
    try {
      const pending = withTimeout(new Promise(() => {}), 100);
      const check = expect(pending).rejects.toThrow('Timed out after 100 ms');
      vi.advanceTimersByTime(100);
      await check;
    } finally {
      vi.useRealTimers();
    }
  });
});

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { DiskCache } from '../src/main/cache';
import { isCurrentCacheFile, MESSAGES, PAGE_MAX_AGE_MS, WowheadClient, type FetchResult } from '../src/main/wowheadClient';
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
const FEL_ORC = link('https://www.wowhead.com/tbc/quest=10482');
const FEL_ORC_TOOLTIP_URL = 'https://nether.wowhead.com/tbc/tooltip/quest/10482';
const ARCANE_SHOT = link('https://www.wowhead.com/tbc/spell=27019');
const ARCANE_SHOT_TOOLTIP_URL = 'https://nether.wowhead.com/tbc/tooltip/spell/27019';
const ZONES_URL = 'https://nether.wowhead.com/tbc/data/global';
const TOOLTIP_URL = 'https://nether.wowhead.com/tbc/tooltip/item/28773';
const GERMAN_TOOLTIP_URL = 'https://nether.wowhead.com/tbc/de/tooltip/item/28773';

const ok = (url: string, text: string): FetchResult => ({ status: 200, url, text });
const blocked = (url: string): FetchResult => ({ status: 403, url, text: '<h1>403 ERROR</h1> Request blocked.' });
const gorehowlPage = () => ok(`${GOREHOWL.url}/gorehowl`, fixture('item-28773.html.gz'));
const zones = () => ok(ZONES_URL, fixture('global-tbc.js.gz'));
const tooltip = () => ok(TOOLTIP_URL, fixture('tooltip-28773.json'));
const felOrcPage = () => ok(`${FEL_ORC.url}/fel-orc-scavengers`, fixture('quest-10482.html.gz'));

/** A client on a fake network: address → answer. Addresses it doesn't know fail like an offline network. */
function setup(answers: Record<string, FetchResult>, browserHtml: string | null = null, now?: () => number, browserUrl?: string) {
  const asked: string[] = [];
  const fetchText = vi.fn(async (url: string) => {
    asked.push(url);
    const answer = answers[url];
    if (!answer) throw new Error(`offline: ${url}`);
    return answer;
  });
  const loadInBrowser = vi.fn(async (url: string) => (browserHtml === null ? null : { html: browserHtml, url: browserUrl ?? url }));
  const cache = new DiskCache(mkdtempSync(path.join(tmpdir(), 'whg-client-')));
  return { client: new WowheadClient({ fetchText, loadInBrowser, cache, now }), asked, loadInBrowser, cache };
}

describe('WowheadClient', () => {
  it('reads the item page', async () => {
    const { client } = setup({ [GOREHOWL.url]: gorehowlPage(), [ZONES_URL]: zones() });
    const state = await client.lookup(GOREHOWL);
    if (state.kind !== 'ready' || state.info.kind !== 'item') throw new Error(state.kind);
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
    time = PAGE_MAX_AGE_MS + 1;
    asked.length = 0;
    await client.lookup(GOREHOWL);
    expect(asked).toContain(GOREHOWL.url);
  });

  it('says when Wowhead does not know the item', async () => {
    const notFound = { status: 404, url: 'https://www.wowhead.com/tbc/items?notFound=28773', text: fixture('item-999999.html.gz') };
    const { client } = setup({ [GOREHOWL.url]: notFound });
    expect(await client.lookup(GOREHOWL)).toEqual({ kind: 'error', link: GOREHOWL, message: MESSAGES.notFound('item', 28773), header: null });
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

  it('does not take a page the browser window hands back half-loaded', async () => {
    const page = fixture('item-28773.html.gz');
    const halfLoaded = page.slice(0, page.indexOf('new Listview('));
    const { client } = setup({ [GOREHOWL.url]: blocked(GOREHOWL.url), [ZONES_URL]: zones() }, halfLoaded);
    expect(await client.lookup(GOREHOWL)).toMatchObject({ kind: 'error', message: MESSAGES.blocked });
  });

  it("shows the tooltip service's name and icon when the page stays blocked", async () => {
    const { client } = setup({ [GOREHOWL.url]: blocked(GOREHOWL.url), [TOOLTIP_URL]: tooltip() });
    expect(await client.lookup(GOREHOWL)).toEqual({
      kind: 'error', link: GOREHOWL, message: MESSAGES.blocked, header: { kind: 'item', name: 'Gorehowl', quality: 4, icon: 'inv_axe_60' },
    });
  });

  it('says when Wowhead cannot be reached', async () => {
    const { client } = setup({});
    expect(await client.lookup(GOREHOWL)).toEqual({ kind: 'error', link: GOREHOWL, message: MESSAGES.offline, header: null });
  });

  it('says when the page no longer holds the item', async () => {
    const changed = ok(GOREHOWL.url, 'WH.Gatherer.addData(3, 5, {"1":{"name_enus":"Something else"}}); new Listview({id: "comments"});');
    const { client } = setup({ [GOREHOWL.url]: changed, [ZONES_URL]: zones(), [TOOLTIP_URL]: tooltip() });
    expect(await client.lookup(GOREHOWL)).toMatchObject({ kind: 'error', message: MESSAGES.changed, header: { name: 'Gorehowl' } });
  });

  it('still lists sources when the zone names are missing', async () => {
    const { client } = setup({ [GOREHOWL.url]: gorehowlPage() });
    const state = await client.lookup(GOREHOWL);
    if (state.kind !== 'ready' || state.info.kind !== 'item') throw new Error(state.kind);
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

  it('leaves items cached before quests existed alone (they have no kind)', async () => {
    const { client, asked, cache } = setup({ [GOREHOWL.url]: gorehowlPage(), [ZONES_URL]: zones() });
    cache.set('item-v1-tbc-en-28773', { name: 'Gorehowl', quality: 4, icon: 'inv_axe_60', sections: [], comments: [], commentTotal: 0 });
    const state = await client.lookup(GOREHOWL);
    expect(asked).toContain(GOREHOWL.url);
    expect(state).toMatchObject({ kind: 'ready', info: { kind: 'item' } });
  });

  it('leaves lookups cached before every comment was kept alone', async () => {
    const { client, asked, cache } = setup({ [GOREHOWL.url]: gorehowlPage(), [ZONES_URL]: zones() });
    cache.set('item-v2-tbc-en-28773', { kind: 'item', name: 'Gorehowl', quality: 4, icon: 'inv_axe_60', sections: [], comments: [], commentTotal: 0 });
    await client.lookup(GOREHOWL);
    expect(asked).toContain(GOREHOWL.url);
  });

  it('reads a spell page', async () => {
    const { client } = setup({ [ARCANE_SHOT.url]: ok(ARCANE_SHOT.url, fixture('spell-27019.html.gz')), [ZONES_URL]: zones() });
    expect(await client.lookup(ARCANE_SHOT)).toMatchObject({ kind: 'ready', info: { kind: 'spell', name: 'Arcane Shot', commentTotal: 29 } });
  });

  it("shows the spell tooltip's name and icon when the page stays blocked", async () => {
    const { client } = setup({
      [ARCANE_SHOT.url]: blocked(ARCANE_SHOT.url),
      [ARCANE_SHOT_TOOLTIP_URL]: ok(ARCANE_SHOT_TOOLTIP_URL, fixture('tooltip-spell-27019.json')),
    });
    expect(await client.lookup(ARCANE_SHOT)).toMatchObject({
      kind: 'error', message: MESSAGES.blocked,
      header: { kind: 'spell', name: 'Arcane Shot', quality: 1, icon: 'ability_impalingbolt' },
    });
  });

  it('names the kind in the not-found message', () => {
    expect(MESSAGES.notFound('quest', 10482)).toBe("Wowhead doesn't know quest 10482.");
  });

  it('says when Wowhead does not know the quest', async () => {
    const notFound = { status: 404, url: FEL_ORC.url, text: fixture('quest-999999.html.gz') };
    const { client } = setup({ [FEL_ORC.url]: notFound });
    expect(await client.lookup(FEL_ORC)).toEqual({
      kind: 'error', link: FEL_ORC, message: "Wowhead doesn't know quest 10482.", header: null,
    });
  });

  it('reads a quest page', async () => {
    const { client } = setup({ [FEL_ORC.url]: felOrcPage(), [ZONES_URL]: zones() });
    const state = await client.lookup(FEL_ORC);
    if (state.kind !== 'ready' || state.info.kind !== 'quest') throw new Error(state.kind);
    expect(state.info.name).toBe('Fel Orc Scavengers');
    expect(state.info.chain.map((step) => step.quests[0].name)).toEqual(['Know your Enemy', 'Fel Orc Scavengers', 'Ill Omens']);
    expect(state.info.commentTotal).toBe(21);
  });

  it("shows the quest tooltip's name, with the quest icon, when the page stays blocked", async () => {
    const { client } = setup({
      [FEL_ORC.url]: blocked(FEL_ORC.url),
      [FEL_ORC_TOOLTIP_URL]: ok(FEL_ORC_TOOLTIP_URL, fixture('tooltip-quest-10482.json')),
    });
    expect(await client.lookup(FEL_ORC)).toEqual({
      kind: 'error', link: FEL_ORC, message: MESSAGES.blocked,
      header: { kind: 'quest', name: 'Fel Orc Scavengers', quality: 1, icon: 'inv_misc_note_01' },
    });
  });

  it('keeps a quest and an item with the same number apart', async () => {
    const sameNumber = link('https://www.wowhead.com/tbc/item=10482');
    const { client, asked } = setup({ [FEL_ORC.url]: felOrcPage(), [ZONES_URL]: zones() });
    expect((await client.lookup(FEL_ORC)).kind).toBe('ready');
    asked.length = 0;
    await client.lookup(sameNumber);
    expect(asked).toContain(sameNumber.url);
  });

  it('shares a lookup that is in flight, answering each with its own link', async () => {
    const withChain = link(`${FEL_ORC.url}#chain=10160~Know%20your%20Enemy.10482~Fel%20Orc%20Scavengers`);
    const { client, asked } = setup({ [FEL_ORC.url]: felOrcPage(), [ZONES_URL]: zones() });
    const [plain, chained] = await Promise.all([client.lookup(FEL_ORC), client.lookup(withChain)]);
    expect(asked.filter((url) => url === FEL_ORC.url)).toHaveLength(1);
    expect(plain).toMatchObject({ kind: 'ready' });
    expect(plain.link.chain).toBeUndefined();
    expect(chained).toMatchObject({ kind: 'ready', link: { chain: withChain.chain } });
  });

  it("says the item is unknown when the hidden window lands on Wowhead's not-found page", async () => {
    const { client } = setup({ [GOREHOWL.url]: blocked(GOREHOWL.url) }, fixture('item-999999.html.gz'), undefined,
      'https://www.wowhead.com/tbc/items?notFound=28773');
    expect(await client.lookup(GOREHOWL)).toMatchObject({ kind: 'error', message: MESSAGES.notFound('item', 28773) });
  });

  it('does not save a result without zone names', async () => {
    const { client, asked } = setup({ [GOREHOWL.url]: gorehowlPage() });
    await client.lookup(GOREHOWL);
    await client.lookup(GOREHOWL);
    expect(asked.filter((url) => url === GOREHOWL.url)).toHaveLength(2);
  });

  it('asks the tooltip service in the link language', async () => {
    const { client } = setup({
      [GERMAN.url]: blocked(GERMAN.url),
      [GERMAN_TOOLTIP_URL]: ok(GERMAN_TOOLTIP_URL, '{"name":"Blutschrei","quality":4,"icon":"inv_axe_60"}'),
    });
    expect(await client.lookup(GERMAN)).toMatchObject({ header: { name: 'Blutschrei' } });
  });
});

describe('the cache version', () => {
  it('leaves quests saved before they had rewards, so they are looked up again', () => {
    expect(isCurrentCacheFile('quest-v4-tbc-en-10482.json')).toBe(false);
    expect(isCurrentCacheFile('quest-v5-tbc-en-10482.json')).toBe(true);
  });
});

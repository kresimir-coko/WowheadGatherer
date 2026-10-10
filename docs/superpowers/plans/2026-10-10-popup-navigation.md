# Clicking Through Quests and More Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the app's popup, quests in a chain and an item's related quests can be clicked to open them in the popup, with a breadcrumb back. Comments open at the best 3, and "Show 5 more comments" adds five per click.

**Architecture:**
- **Data:** pages gain the data they need: chain quest IDs, "Starts quest" and "Needed for" sections with quest IDs, and every comment.
- **The trail:** a pure `Trail` module in the main process holds the pages clicked through, and decides which clicks are allowed.
- **The page:** it sends only a quest ID or a breadcrumb position through the preload bridge. The main process builds the address, looks it up through the existing client, and sends the state back with the breadcrumb names.
- **The renderer:** it draws the breadcrumb, the clickable names and the comment paging.

**Tech Stack:** Electron 44, TypeScript 7, esbuild, Vitest 5, happy-dom.

**Spec:** `docs/superpowers/specs/2026-10-10-popup-navigation-design.md`. It builds on `docs/superpowers/specs/2026-10-10-quests-and-wow-look-design.md`.

## Global Constraints

- **Only the app changes.** The add-on and the link contract (`https://www.wowhead.com/[site/][lang/]<item|quest>=<id>`) stay as they are.
- **What's clickable:**
  - quests in a chain, except the quest on show and quests without an ID;
  - rows in an item's **Starts quest** (Listview `starts`) and **Needed for** (Listview `objective-of`) sections.
  - "Quest reward" rows stay plain text.
- **No repeats:** a quest already under Starts quest isn't repeated under Needed for.
- **Comments:** a page opens with 3 comments (`FIRST_COMMENTS = 3`). Each click on the button adds 5 (`MORE_COMMENTS = 5`). The button says "Show N more comments", or "Show 1 more comment", and disappears when all are shown.
- **The breadcrumb:**
  - It shows the names of earlier pages, oldest first, each clickable, then `›`, then the page on show.
  - Clicking step *i* drops it and everything after it.
  - A new Ctrl+C in the game, or closing the popup, clears it.
- **Security:**
  - The page sends only numbers.
  - The app opens a quest only if it's clickable on the page now on show. It goes back only to a whole-number index inside the trail.
  - It builds the address itself, with the page's game and language.
  - Wowhead text goes in only as text. Clickable names are `<button>` elements.
- **Wowhead politeness:** one page request per click. Nothing is fetched ahead of time. Saved lookups go to cache version 3.
- **Commands:**
  - From `app/`: `npm test`, `npm run typecheck`, `npm run build`. If Git Bash can't find `npm`, prefix with `export PATH="/c/Program Files/nodejs:$PATH" &&`.
  - Electron needs `env -u ELECTRON_RUN_AS_NODE`.
  - Add-on tests (repo root): `.venv/Scripts/python -m pytest tests -q`, 156 passed, unchanged.
- **Commits:** Conventional Commits, each ending with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (as a second `-m`).
- **Paths:** the repo is `/d/Development/WoW Addons/WowheadGatherer`, branch `feat/wowhead-gatherer`. The scratchpad is `C:\Users\kresi\AppData\Local\Temp\claude\d--Development-WoW-Addons\2eadad6d-accf-42c0-8661-625beb7a9ccc\scratchpad` (`$SCRATCH`).

## Review Focus

These are the inputs the spec implies but its happy paths don't exercise. Each one has a test in the task named.

1. **A stale or forged click:** a quest ID that isn't clickable on the page now on show, the current quest, a string, a fraction, or a click with the popup closed → ignored, trail unchanged. *Task 2 (`refuses …`, `refuses a click with the popup closed`).*
2. **A bad breadcrumb index:** negative, a fraction, a string, past the end → ignored. *Task 2 (`refuses to go back to …`).*
3. **The comment count at its edges:** 0 comments, exactly 3, 4 ("Show 1 more comment"), 12 (5 then 4) → the right button text, or no button. *Task 4 (`more comments` tests).*
4. **An item listed as both starting and needing the same quest** (Magtheridon's Head) → it's listed once, under Starts quest. *Task 1 (`Magtheridon's Head: the quest it starts, listed once`).*
5. **A clicked-to page that fails to load** (error, no header) → its breadcrumb name is "Quest 10160", and going back still works. *Task 2 (`pageName` tests) and Task 4 (`keeps the breadcrumb while the next quest loads`).*

## File Structure

```
app/src/shared/types.ts        ChainQuest.id, SourceRow.questId, PopupState.trail (Tasks 1, 3)
app/src/shared/pageName.ts     NEW: headerOf(state), pageName(state) (Task 2)
app/src/main/questPage.ts      chain quest IDs from the links (Task 1)
app/src/main/questInfo.ts      the quest on show gets the page's ID (Task 1)
app/src/main/itemInfo.ts       Starts quest / Needed for sections (Task 1)
app/src/main/comments.ts       every comment, best first (Task 1)
app/src/main/wowheadClient.ts  cache version 3 (Task 1)
app/src/main/trail.ts          NEW: Trail, clickableQuestIds, questLink (Task 2)
app/src/preload/preload.ts     openQuest, goBack (Task 3)
app/src/main/popupWindow.ts    handlers, current(), replace(), sender checks (Task 3)
app/src/main/main.ts           wiring (Task 3)
app/src/renderer/popup.ts      breadcrumb, clickable names, comment paging (Task 4)
app/static/popup.css           link, breadcrumb and button styles (Task 4)
CLAUDE.md                      notes (Task 5)
```

---

### Task 1: The data — chain IDs, related quests, every comment

**Files:**
- Modify: `app/src/shared/types.ts`, `app/src/main/questPage.ts`, `app/src/main/questInfo.ts`, `app/src/main/itemInfo.ts`, `app/src/main/comments.ts`, `app/src/main/wowheadClient.ts`
- Test: `app/test/questPage.test.ts`, `app/test/questInfo.test.ts`, `app/test/itemInfo.test.ts`, `app/test/comments.test.ts`, `app/test/wowheadClient.test.ts`, `app/test/popup.test.ts` (sample data only)

**Interfaces:**
- Consumes: the existing readers.
- Produces:
  - `ChainQuest { id: number; name: string; current: boolean }`, where `id` is 0 when the page links none.
  - `SourceRow { name; details; questId?: number }`. Only Starts quest and Needed for rows carry `questId`.
  - `pickComments` returns every top-level, not-deleted comment, best first. `COMMENTS_SHOWN` is gone.
  - Cache version 3.

- [ ] **Step 1: Write the failing tests**

In `app/test/questPage.test.ts`:

- In the Fel Orc test, make the chain expectation:

```ts
    expect(page.chain).toEqual([
      { position: 1, quests: [{ id: 10160, name: 'Know your Enemy', current: false }] },
      { position: 2, quests: [{ id: 0, name: 'Fel Orc Scavengers', current: true }] },
      { position: 3, quests: [{ id: 10483, name: 'Ill Omens', current: false }] },
    ]);
```

- In the Arrival in Outland test, change `expect(chain[0].quests[0].name).toBe('A New Beginning');` to `expect(chain[0].quests[0]).toEqual({ id: 64028, name: 'A New Beginning', current: false });`, and the `chain[6]` line to `expect(chain[6]).toEqual({ position: 7, quests: [{ id: 0, name: 'Arrival in Outland', current: true }] });`.
- In the made-up branching test, make the chain expectation:

```ts
    expect(page.chain).toEqual([
      { position: 1, quests: [{ id: 1, name: 'Arms & Armor', current: false }, { id: 2, name: 'Shields', current: false }] },
      { position: 2, quests: [{ id: 0, name: "Lieutenant's Orders", current: true }] },
    ]);
```

In `app/test/questInfo.test.ts`, in the Fel Orc test, replace `expect(quest?.comments).toHaveLength(3);` with:

```ts
    expect(quest?.comments).toHaveLength(21);
    // The page links every chain quest but the one on show; it gets the page's own ID.
    expect(quest?.chain[1].quests[0]).toEqual({ id: 10482, name: 'Fel Orc Scavengers', current: true });
```

In `app/test/comments.test.ts`, replace the Thunderfury test with:

```ts
  it('lists every top-level comment, best first (Thunderfury)', () => {
    const { comments, total } = pickComments(parseItemPage(fixture('item-19019.html.gz')), none);
    expect(total).toBe(350);
    expect(comments).toHaveLength(350);
    expect(comments.slice(0, 3).map((c) => c.rating)).toEqual([522, 283, 262]);
    expect(comments[0]).toMatchObject({ user: 'Koen', date: 'Dec 2006' });
  });
```

In `app/test/itemInfo.test.ts`, the Refreshing Spring Water test's section list now starts with "Needed for": the water is an objective of "Give Gerard a Drink" and others. Make it `['Needed for', 'Dropped by', 'Sold by', 'Quest reward', 'Contained in', 'Mined from', 'Pickpocketed from']`, and add after its `soldBy` lines: `expect(section(159, 'Needed for').rows[0]).toEqual({ name: 'Give Gerard a Drink', details: ['Level 1', 'Alliance'], questId: 16 });`. Also add inside `describe('buildItemInfo')`:

```ts
  it("Magtheridon's Head: the quest it starts, listed once", () => {
    const head = info(32385);
    expect(head.sections[0]).toEqual({
      title: 'Starts quest', total: 1,
      rows: [{ name: 'The Fall of Magtheridon', details: ['Level 70', 'Alliance'], questId: 11002 }],
    });
    // Wowhead also lists it as needing the head; it isn't repeated.
    expect(head.sections.map((s) => s.title)).not.toContain('Needed for');
  });

  it('Unidentified Plant Parts: the quests that need it, first', () => {
    expect(info(24401).sections[0]).toEqual({
      title: 'Needed for', total: 2,
      rows: [
        { name: 'Identify Plant Parts', details: ['Level 64'], questId: 9784 },
        { name: 'Plants of Zangarmarsh', details: ['Level 63'], questId: 9802 },
      ],
    });
  });

  it("Duron's Report: needed for two quests, and no comments", () => {
    const report = info(28105);
    expect(report.sections[0].rows.map((row) => row.questId)).toEqual([10140, 10288]);
    expect(report).toMatchObject({ comments: [], commentTotal: 0 });
  });
```

In `app/test/wowheadClient.test.ts`, add inside `describe('WowheadClient')`:

```ts
  it('leaves lookups cached before every comment was kept alone', async () => {
    const { client, asked, cache } = setup({ [GOREHOWL.url]: gorehowlPage(), [ZONES_URL]: zones() });
    cache.set('item-v2-tbc-en-28773', { kind: 'item', name: 'Gorehowl', quality: 4, icon: 'inv_axe_60', sections: [], comments: [], commentTotal: 0 });
    await client.lookup(GOREHOWL);
    expect(asked).toContain(GOREHOWL.url);
  });
```

In `app/test/popup.test.ts`, give the sample `quest`'s chain IDs, since `ChainQuest.id` becomes required:

```ts
  chain: [
    { position: 1, quests: [{ id: 10160, name: 'Know your Enemy', current: false }] },
    { position: 2, quests: [{ id: 10482, name: 'Fel Orc Scavengers', current: true }] },
    { position: 3, quests: [{ id: 10483, name: 'Ill Omens', current: false }, { id: 0, name: 'Shields', current: false }] },
  ],
```

Also, in its "never turns quest names into HTML" test, use `quests: [{ id: 10482, name: evil, current: true }]`.

- [ ] **Step 2: Run them to see them fail**

Run: `cd app && npx vitest run`
Expected:
- **Failing:** the questPage chain tests (no `id`); the questInfo Fel Orc test; the Thunderfury comments test (3, not 350); the three new itemInfo tests and the Refreshing Spring Water test (no such sections); the new client test (the v2 entry is still read).
- Everything else passes.

- [ ] **Step 3: Implement**

In `app/src/shared/types.ts`:
- In `SourceRow`, after `details`, add:

```ts
  /** The quest a Starts quest or Needed for row is about, which the player can open from the popup. */
  questId?: number;
```

- Replace `ChainQuest` with:

```ts
/** One quest of a chain step, and whether it's the quest on show. */
export interface ChainQuest {
  /** Wowhead's quest ID; 0 when the page links none. */
  id: number;
  name: string;
  current: boolean;
}
```

In `app/src/main/questPage.ts`:
- After `const TAG = …`, add `const QUEST_HREF = /href="[^"]*\/quest=(\d+)/i;`.
- Replace `readQuest` with:

```ts
/** The quest on show is bold; the others are links to their pages, which carry their IDs. */
function readQuest(html: string): ChainQuest {
  const id = Number(QUEST_HREF.exec(html)?.[1] ?? 0);
  return { id, name: textOf(html), current: !/<a\b/i.test(html) && /<b>/i.test(html) };
}
```

In `app/src/main/questInfo.ts`, change `chain: page.chain,` to:

```ts
    // The page doesn't link the quest on show, so it gets the page's own ID.
    chain: page.chain.map((step) => ({
      ...step,
      quests: step.quests.map((chainQuest) => (chainQuest.current ? { ...chainQuest, id: questId } : chainQuest)),
    })),
```

In `app/src/main/itemInfo.ts`:

1. Change the `RowStyle` type to `type RowStyle = 'chance' | 'vendor' | 'quest' | 'crafted' | 'related-quest';`.
2. Make the first two `SECTIONS` entries:

```ts
  // A quest item's quests come first: for one, they're what matters.
  { title: 'Starts quest', ids: ['starts'], style: 'related-quest' },
  { title: 'Needed for', ids: ['objective-of'], style: 'related-quest' },
```

3. In `toRow`:
   - Change `case 'quest':` to a fall-through pair, `case 'quest':` followed by `case 'related-quest':`, sharing the same `details` line.
   - Replace the final `return` with:

```ts
  const shown = details.filter((detail): detail is string => detail !== null);
  const questId = style === 'related-quest' ? num(row.id) : undefined;
  return questId ? { name: row.name, details: shown, questId } : { name: row.name, details: shown };
```

4. In `buildSections`, replace the first lines of the loop (up to and including `if (rows.length === 0) continue;`) with:

```ts
  // Quests already listed aren't listed again: Magtheridon's Head starts and needs the same one.
  const listedQuests = new Set<unknown>();
  for (const { title, ids, style } of SECTIONS) {
    let rows = ids.flatMap((id) => page.listviews.get(id) ?? []);
    if (style === 'related-quest') {
      rows = rows.filter((row) => !listedQuests.has(row.id));
      for (const row of rows) listedQuests.add(row.id);
    }
    if (rows.length === 0) continue;
```

   The `const sections: SourceSection[] = [];` line stays above it.

In `app/src/main/comments.ts`:
- Delete `/** How many comments the popup shows. */` and `export const COMMENTS_SHOWN = 3;`.
- In `pickComments`, remove `.slice(0, COMMENTS_SHOWN)`.
- Change its comment to `/** Every top-level comment, pinned first, then by rating; the popup decides how many to show. */`.

In `app/src/main/wowheadClient.ts`, change the cache version lines to:

```ts
/** Bump when what's cached changes shape, so old cache files are left alone. 2: lookups gained `kind`; 3: every comment, quest IDs. */
const CACHE_VERSION = 3;
```

- [ ] **Step 4: Run the tests and the type check**

Run: `cd app && npm run typecheck && npx vitest run`
Expected: `tsc` prints nothing; `Tests 181 passed (181)`.

- [ ] **Step 5: Commit**

```bash
git add app/src app/test
git commit -m "feat(app): quest IDs in chains, an item's related quests, and every comment" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The trail

**Files:**
- Create: `app/src/shared/pageName.ts`, `app/src/main/trail.ts`, `app/test/trail.test.ts`

**Interfaces:**
- Consumes: `PopupState`, `QuestInfo`, `ItemInfo` (types.ts), `parseWowheadLink`/`WowheadLink`, and `ChainQuest.id` and `SourceRow.questId` (Task 1).
- Produces:
  - `headerOf(state: PopupState): PageHeader | null` and `pageName(state: PopupState): string` (shared/pageName.ts).
  - `questLink(from: WowheadLink, id: number): WowheadLink | null`.
  - `clickableQuestIds(state: PopupState | null): Set<number>`.
  - `class Trail { names(): string[]; clear(): void; open(current: PopupState | null, id: unknown): WowheadLink | null; back(index: unknown): WowheadLink | null }`.

- [ ] **Step 1: Write the failing tests**

Create `app/test/trail.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { clickableQuestIds, questLink, Trail } from '../src/main/trail';
import { pageName } from '../src/shared/pageName';
import type { ItemInfo, PopupState, QuestInfo } from '../src/shared/types';
import { parseWowheadLink, type WowheadLink } from '../src/shared/wowheadLink';

function link(url: string): WowheadLink {
  const parsed = parseWowheadLink(url);
  if (!parsed) throw new Error(url);
  return parsed;
}

const FEL_ORC = link('https://www.wowhead.com/tbc/de/quest=10482');
const DURONS_REPORT = link('https://www.wowhead.com/tbc/item=28105');
const felOrc: QuestInfo = {
  kind: 'quest', name: 'Plünderer der Höllenorcs', quality: 1, icon: 'inv_misc_note_01', comments: [], commentTotal: 0,
  chain: [
    { position: 1, quests: [{ id: 10160, name: 'Den Feind kennen', current: false }] },
    { position: 2, quests: [{ id: 10482, name: 'Plünderer der Höllenorcs', current: true }] },
    { position: 3, quests: [{ id: 10483, name: 'Schwarze Magie', current: false }, { id: 0, name: 'Unlinked', current: false }] },
  ],
};
const duronsReport: ItemInfo = {
  kind: 'item', name: "Duron's Report", quality: 1, icon: 'inv_letter_04', comments: [], commentTotal: 0,
  sections: [
    { title: 'Needed for', total: 2, rows: [
      { name: 'Journey to Honor Hold', details: ['Level 61'], questId: 10140 },
      { name: 'Arrival in Outland', details: ['Level 61'], questId: 10288 },
    ] },
    { title: 'Quest reward', total: 1, rows: [{ name: 'Some Quest', details: [] }] },
  ],
};
const onFelOrc: PopupState = { kind: 'ready', link: FEL_ORC, info: felOrc };
const onReport: PopupState = { kind: 'ready', link: DURONS_REPORT, info: duronsReport };

describe('questLink', () => {
  it('keeps the game and language of the page it came from', () => {
    expect(questLink(FEL_ORC, 10160)).toEqual({
      url: 'https://www.wowhead.com/tbc/de/quest=10160', site: 'tbc', lang: 'de', kind: 'quest', id: 10160,
    });
  });
});

describe('clickableQuestIds', () => {
  it("is a quest's chain, without the quest on show or quests without an ID", () => {
    expect([...clickableQuestIds(onFelOrc)]).toEqual([10160, 10483]);
  });

  it("is an item's related quests, not its quest rewards", () => {
    expect([...clickableQuestIds(onReport)]).toEqual([10140, 10288]);
  });

  it('is nothing while loading, after an error, or with the popup closed', () => {
    expect(clickableQuestIds({ kind: 'loading', link: FEL_ORC }).size).toBe(0);
    expect(clickableQuestIds({ kind: 'error', link: FEL_ORC, message: 'x', header: null }).size).toBe(0);
    expect(clickableQuestIds(null).size).toBe(0);
  });
});

describe('pageName', () => {
  it('is the name the page gave', () => {
    expect(pageName(onReport)).toBe("Duron's Report");
    const header = { kind: 'item' as const, name: "Duron's Report", quality: 1, icon: '' };
    expect(pageName({ kind: 'error', link: DURONS_REPORT, message: 'x', header })).toBe("Duron's Report");
  });

  it('falls back to the kind and number', () => {
    expect(pageName({ kind: 'loading', link: DURONS_REPORT })).toBe('Item 28105');
    expect(pageName({ kind: 'error', link: FEL_ORC, message: 'x', header: null })).toBe('Quest 10482');
  });
});

describe('Trail', () => {
  it('opens a quest from the page on show, which joins the trail', () => {
    const trail = new Trail();
    expect(trail.open(onReport, 10288)?.url).toBe('https://www.wowhead.com/tbc/quest=10288');
    expect(trail.names()).toEqual(["Duron's Report"]);
  });

  it.each([
    ['a quest the page does not show', 99999],
    ['the quest on show', 10482],
    ['a quest without an ID', 0],
    ['a number in a string', '10160'],
    ['a fraction', 10160.5],
    ['nothing', undefined],
  ])('refuses %s', (_, id) => {
    const trail = new Trail();
    expect(trail.open(onFelOrc, id)).toBeNull();
    expect(trail.names()).toEqual([]);
  });

  it('refuses a click with the popup closed', () => {
    expect(new Trail().open(null, 10160)).toBeNull();
  });

  it('goes back to an earlier page, dropping it and everything after it', () => {
    const trail = new Trail();
    trail.open(onReport, 10288);
    const arrival: QuestInfo = {
      ...felOrc, name: 'Arrival in Outland',
      chain: [{ position: 1, quests: [{ id: 10140, name: 'Journey to Honor Hold', current: false }] }],
    };
    trail.open({ kind: 'ready', link: link('https://www.wowhead.com/tbc/quest=10288'), info: arrival }, 10140);
    expect(trail.names()).toEqual(["Duron's Report", 'Arrival in Outland']);
    expect(trail.back(0)?.url).toBe(DURONS_REPORT.url);
    expect(trail.names()).toEqual([]);
  });

  it.each([[-1], [1], [0.5], ['0'], [undefined]])('refuses to go back to %s', (index) => {
    const trail = new Trail();
    trail.open(onReport, 10288);
    expect(trail.back(index)).toBeNull();
    expect(trail.names()).toEqual(["Duron's Report"]);
  });

  it('starts over', () => {
    const trail = new Trail();
    trail.open(onReport, 10288);
    trail.clear();
    expect(trail.names()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd app && npx vitest run test/trail.test.ts`
Expected: the file fails to load with `Cannot find module '../src/main/trail'`.

- [ ] **Step 3: Implement**

Create `app/src/shared/pageName.ts`:

```ts
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
```

Create `app/src/main/trail.ts`:

```ts
import { pageName } from '../shared/pageName';
import type { PopupState } from '../shared/types';
import { parseWowheadLink, type WowheadLink } from '../shared/wowheadLink';

/** A page the player clicked away from: its link, and its name for the breadcrumb. */
interface Step {
  link: WowheadLink;
  name: string;
}

/** The address of quest id on the same game and language as the page it's opened from. */
export function questLink(from: WowheadLink, id: number): WowheadLink | null {
  const path = [from.site, from.lang].filter(Boolean).map((part) => `${part}/`).join('');
  return parseWowheadLink(`https://www.wowhead.com/${path}quest=${id}`);
}

/** The quests a page lets the player open: its chain's other quests, or an item's related quests. */
export function clickableQuestIds(state: PopupState | null): Set<number> {
  const ids = new Set<number>();
  if (state?.kind !== 'ready') return ids;
  const { info } = state;
  if (info.kind === 'quest') {
    for (const step of info.chain) {
      for (const quest of step.quests) if (!quest.current && quest.id > 0) ids.add(quest.id);
    }
  } else {
    for (const section of info.sections) {
      for (const row of section.rows) if (row.questId) ids.add(row.questId);
    }
  }
  return ids;
}

function isIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * The pages the player clicked through in the popup, oldest first. The page only
 * sends numbers; this decides what they may open. A fresh lookup from the game starts it over.
 */
export class Trail {
  private steps: Step[] = [];

  /** The breadcrumb: the names of the earlier pages, oldest first. */
  names(): string[] {
    return this.steps.map((step) => step.name);
  }

  clear(): void {
    this.steps = [];
  }

  /**
   * Leaves the page on show for quest id, when that page lets the player click it,
   * and returns the quest's link. A stale or forged click gives null.
   */
  open(current: PopupState | null, id: unknown): WowheadLink | null {
    if (current === null || typeof id !== 'number' || !clickableQuestIds(current).has(id)) return null;
    const link = questLink(current.link, id);
    if (link) this.steps.push({ link: current.link, name: pageName(current) });
    return link;
  }

  /** Goes back to earlier page index, dropping it and everything after it, and returns its link; null for no such page. */
  back(index: unknown): WowheadLink | null {
    if (!isIndex(index) || index >= this.steps.length) return null;
    const { link } = this.steps[index];
    this.steps = this.steps.slice(0, index);
    return link;
  }
}
```

- [ ] **Step 4: Run the tests and the type check**

Run: `cd app && npm run typecheck && npx vitest run`
Expected: `tsc` prints nothing; `Tests 202 passed (202)`.

- [ ] **Step 5: Commit**

```bash
git add app/src/shared/pageName.ts app/src/main/trail.ts app/test/trail.test.ts
git commit -m "feat(app): a trail of the pages clicked through, which decides what a click may open" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Wiring the clicks through Electron

**Files:**
- Modify: `app/src/shared/types.ts`, `app/src/preload/preload.ts`, `app/src/main/popupWindow.ts`, `app/src/main/main.ts`

**Interfaces:**
- Consumes: `Trail` (Task 2).
- Produces:
  - `PopupState` gains `trail?: string[]`.
  - The bridge gains `openQuest(id: number)` (IPC `popup:open-quest`) and `goBack(index: number)` (IPC `popup:go-back`).
  - `new Popup(handlers: PopupHandlers)` with `PopupHandlers { openQuest(id: unknown): void; goBack(index: unknown): void; closed(): void }`.
  - `Popup.current(): PopupState | null` and `Popup.replace(state)`.

These files are Electron glue with no unit tests (as before). The check is the type check, the whole suite, the build, and Task 5's end-to-end run, which clicks inside a real popup window.

- [ ] **Step 1: The state carries the breadcrumb**

In `app/src/shared/types.ts`, replace the `PopupState` type with:

```ts
/** What the popup shows: a lookup, and the pages clicked through to reach it. */
export type PopupState = (
  | { kind: 'loading'; link: WowheadLink }
  | { kind: 'ready'; link: WowheadLink; info: LookupInfo }
  | { kind: 'error'; link: WowheadLink; message: string; header: PageHeader | null }
) & {
  /** The names of the pages clicked through to reach this one, oldest first; none for a fresh lookup. */
  trail?: string[];
};
```

- [ ] **Step 2: The bridge sends numbers**

In `app/src/preload/preload.ts`, add to `bridge` after `openWowhead`:

```ts
  /** Opens a quest the page shows; the app checks it's one the page may open. */
  openQuest(id: number): void {
    ipcRenderer.send('popup:open-quest', id);
  },
  /** Goes back to the breadcrumb's page at index. */
  goBack(index: number): void {
    ipcRenderer.send('popup:go-back', index);
  },
```

- [ ] **Step 3: The window passes clicks on, and only its own**

In `app/src/main/popupWindow.ts`:

1. Change the import line to `import { BrowserWindow, globalShortcut, ipcMain, screen, shell, type IpcMainEvent } from 'electron';`.
2. Above `export class Popup`, add:

```ts
/** What clicks inside the popup ask of the app. */
export interface PopupHandlers {
  openQuest(id: unknown): void;
  goBack(index: unknown): void;
  /** The popup was closed: by Escape, its ×, Open on Wowhead or switching away. */
  closed(): void;
}
```

3. Change `constructor() {` to `constructor(private readonly handlers: PopupHandlers) {`.
4. Replace the three `ipcMain.on(...)` lines with:

```ts
    // Only the popup's own page may ask; the hidden windows that load Wowhead pages have no bridge, but check anyway.
    const fromPopup = (event: IpcMainEvent) => event.sender === this.window.webContents;
    ipcMain.on('popup:close', (event) => fromPopup(event) && this.hide());
    ipcMain.on('popup:open-wowhead', (event) => fromPopup(event) && this.openOnWowhead());
    ipcMain.on('popup:height', (event, height: unknown) => fromPopup(event) && this.fitHeight(height));
    ipcMain.on('popup:open-quest', (event, id: unknown) => fromPopup(event) && this.handlers.openQuest(id));
    ipcMain.on('popup:go-back', (event, index: unknown) => fromPopup(event) && this.handlers.goBack(index));
```

5. After `update(state)`, add:

```ts
  /** The lookup on show, or null when the popup is hidden. */
  current(): PopupState | null {
    return this.state;
  }

  /** Shows another page where the popup already is: a click inside it. */
  replace(state: PopupState): void {
    if (this.window.isVisible()) this.show(state);
  }
```

6. In `hide()`, after `globalShortcut.unregister('Escape');`, add `this.handlers.closed();`.

- [ ] **Step 4: Wire the trail in main**

In `app/src/main/main.ts`:
- Add `import { Trail } from './trail';`.
- Replace the body of `start()` from `const popup = new Popup();` through the end of the `watcher = new ClipboardWatcher({ … });` statement with:

```ts
  const trail = new Trail();
  const client = new WowheadClient({
    fetchText,
    loadInBrowser,
    cache: new DiskCache(path.join(app.getPath('userData'), 'cache')),
  });
  // Results carry the breadcrumb as it is when they arrive; latestOnly drops any the player has clicked past.
  const lookUp = latestOnly(
    (link: WowheadLink) => client.lookup(link),
    (state) => popup.update({ ...state, trail: trail.names() }),
  );
  // A click inside the popup: show the page loading where the popup is, then look it up.
  const goTo = (link: WowheadLink | null) => {
    if (!link) return;
    popup.replace({ kind: 'loading', link, trail: trail.names() });
    lookUp(link);
  };
  const popup = new Popup({
    openQuest: (id) => goTo(trail.open(popup.current(), id)),
    goBack: (index) => goTo(trail.back(index)),
    closed: () => trail.clear(),
  });
  const ownExe = path.basename(process.execPath).toLowerCase();

  watcher = new ClipboardWatcher({
    clipboardSequence,
    foregroundExeName,
    readClipboardText: () => clipboard.readText(),
    onLink: (link) => {
      // A lookup from the game starts a fresh trail.
      trail.clear();
      popup.open({ kind: 'loading', link });
      lookUp(link);
    },
    onForeground: (gameInFront, exeName) => {
      // Switching to another program hides the popup. Clicking the popup doesn't, since it never takes focus.
      if (!gameInFront && exeName !== '' && exeName.toLowerCase() !== ownExe) popup.hide();
    },
  });
```

  Keep `watcher.start();` and the tray code after it unchanged. Also check that `start()` still begins with `prepareWowheadSession();`.

- [ ] **Step 5: Type check, test, build**

Run: `cd app && npm run typecheck && npx vitest run && npm run build`
Expected: `tsc` prints nothing; `Tests 202 passed (202)`; esbuild writes `dist/main.js`, `dist/preload.js` and `dist/popup.js` with no errors.

- [ ] **Step 6: Commit**

```bash
git add app/src/shared/types.ts app/src/preload/preload.ts app/src/main/popupWindow.ts app/src/main/main.ts
git commit -m "feat(app): pass quest and breadcrumb clicks from the popup to the trail" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The popup page — breadcrumb, clickable quests, more comments

**Files:**
- Modify: `app/src/renderer/popup.ts`, `app/static/popup.css`
- Test: `app/test/popup.test.ts`

**Interfaces:**
- Consumes:
  - `headerOf`, `pageName` (Task 2);
  - `PopupState.trail`, plus the bridge's `openQuest` and `goBack` (Task 3);
  - `ChainQuest.id` and `SourceRow.questId` (Task 1).
- Produces:
  - `PopupActions { close; openWowhead; openQuest(id: number); goBack(index: number); resized() }`.
  - `FIRST_COMMENTS = 3`, `MORE_COMMENTS = 5`.
  - DOM:
    - `nav.trail` > `button.crumb` + `span.sep` (›) per earlier page, then `span.here`;
    - `button.quest-link` for clickable chain quests;
    - `button.name.quest-link` for clickable section rows;
    - `button.more-comments`.

- [ ] **Step 1: Write the failing tests**

In `app/test/popup.test.ts`:

- Change the `beforeEach` actions to `actions = { close: vi.fn(), openWowhead: vi.fn(), openQuest: vi.fn(), goBack: vi.fn(), resized: vi.fn() };`.
- Append:

```ts
const comments = (count: number) => Array.from({ length: count }, (_, i) => ({
  user: `u${i}`, rating: count - i, date: '', body: [{ kind: 'text' as const, text: `c${i}` }],
}));

describe('clicking through', () => {
  it('opens the other quests of the chain, not the one on show or one without an ID', () => {
    show({ kind: 'ready', link: questLink, info: quest });
    const links = [...root.querySelectorAll<HTMLButtonElement>('.chain button.quest-link')];
    expect(links.map((button) => button.textContent)).toEqual(['Know your Enemy', 'Ill Omens']);
    links[0].click();
    expect(actions.openQuest).toHaveBeenCalledWith(10160);
    expect(root.querySelector('.chain .current')?.tagName).toBe('SPAN');
  });

  it('opens the quests an item starts or is needed for, not its quest rewards', () => {
    const related: ItemInfo = { ...info, sections: [
      { title: 'Starts quest', total: 1, rows: [{ name: 'The Fall of Magtheridon', details: ['Level 70'], questId: 11002 }] },
      { title: 'Quest reward', total: 1, rows: [{ name: 'Some Quest', details: ['Level 60'] }] },
    ] };
    show({ kind: 'ready', link, info: related });
    const links = [...root.querySelectorAll<HTMLButtonElement>('section button.quest-link')];
    expect(links.map((button) => button.textContent)).toEqual(['The Fall of Magtheridon']);
    links[0].click();
    expect(actions.openQuest).toHaveBeenCalledWith(11002);
    expect(all('section li .name')).toEqual(['The Fall of Magtheridon', 'Some Quest']);
  });

  it('shows the breadcrumb and goes back from it', () => {
    show({ kind: 'ready', link: questLink, info: quest, trail: ["Duron's Report", 'Arrival in Outland'] });
    expect(all('.trail .crumb')).toEqual(["Duron's Report", 'Arrival in Outland']);
    expect(text('.trail .here')).toBe('Fel Orc Scavengers');
    root.querySelectorAll<HTMLButtonElement>('.trail .crumb')[1].click();
    expect(actions.goBack).toHaveBeenCalledWith(1);
    show({ kind: 'ready', link: questLink, info: quest });
    expect(root.querySelector('.trail')).toBeNull();
  });

  it('keeps the breadcrumb while the next quest loads', () => {
    show({ kind: 'loading', link: questLink, trail: ['Fel Orc Scavengers'] });
    expect(all('.trail .crumb')).toEqual(['Fel Orc Scavengers']);
    expect(text('.trail .here')).toBe('Quest 10482');
  });

  it('never turns breadcrumb names into HTML', () => {
    const evil = '<img src=x onerror=alert(1)>';
    show({ kind: 'loading', link: questLink, trail: [evil] });
    expect(root.querySelector('img')).toBeNull();
    expect(text('.trail .crumb')).toBe(evil);
  });

  it('starts each page at the top', () => {
    root.scrollTop = 120;
    show({ kind: 'loading', link: questLink });
    expect(root.scrollTop).toBe(0);
  });
});

describe('more comments', () => {
  it('shows the best 3, then 5 more per click, until all are shown', () => {
    show({ kind: 'ready', link, info: { ...info, comments: comments(12), commentTotal: 12 } });
    const more = () => root.querySelector<HTMLButtonElement>('.more-comments');
    expect(root.querySelectorAll('.comment')).toHaveLength(3);
    expect(more()?.textContent).toBe('Show 5 more comments');
    more()?.click();
    expect(root.querySelectorAll('.comment')).toHaveLength(8);
    expect(more()?.textContent).toBe('Show 4 more comments');
    more()?.click();
    expect(root.querySelectorAll('.comment')).toHaveLength(12);
    expect(more()).toBeNull();
    expect(actions.resized).toHaveBeenCalledTimes(2);
    expect(all('.comment .body')).toEqual(comments(12).map((c) => c.body[0].text));
  });

  it('says "1 more comment", and has no button for 3 or fewer', () => {
    show({ kind: 'ready', link, info: { ...info, comments: comments(4), commentTotal: 4 } });
    expect(text('.more-comments')).toBe('Show 1 more comment');
    show({ kind: 'ready', link, info: { ...info, comments: comments(3), commentTotal: 3 } });
    expect(root.querySelector('.more-comments')).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd app && npx vitest run test/popup.test.ts`
Expected:
- The 8 new tests fail: there are no `.quest-link`, `.trail` or `.more-comments` elements, every comment shows at once, and the scroll stays at 120.
- The old tests pass.

If `starts each page at the top` passes before the change, happy-dom doesn't keep `scrollTop`. In that case, drop that test and record a ruling: the line stays, untested.

- [ ] **Step 3: Implement**

In `app/src/renderer/popup.ts`:

1. Change the imports to:

```ts
import type { GathererBridge } from '../preload/preload';
import { headerOf, pageName } from '../shared/pageName';
import type { ChainStep, ItemComment, LookupInfo, MarkupNode, PopupState, SourceSection } from '../shared/types';
```

2. Replace `PopupActions` with:

```ts
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
}
```

3. After `const MAX_QUALITY = 7;`, add:

```ts
/** Comments a page opens with, and how many more each click on the button adds. */
export const FIRST_COMMENTS = 3;
export const MORE_COMMENTS = 5;
```

4. Delete the local `headerOf` function (it now comes from shared/pageName.ts).
5. In `renderHeader`, delete the `fallbackName` line, and change the `h1` line to `header.append(el('h1', quest ? 'quest' : \`q${quality}\`, pageName(state)));`.
6. Add these functions after `renderHeader`:

```ts
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
```

7. Change `renderSection(section: SourceSection)` to `renderSection(section: SourceSection, actions: PopupActions)`, and its `item.append(el('span', 'name', row.name));` line to:

```ts
    item.append(row.questId ? questButton(row.name, row.questId, actions, 'name quest-link') : el('span', 'name', row.name));
```

8. Change `renderChain(chain: ChainStep[])` to `renderChain(chain: ChainStep[], actions: PopupActions)`, and its `names.append(el('span', quest.current ? 'current' : undefined, quest.name));` line to:

```ts
      const clickable = !quest.current && quest.id > 0;
      names.append(clickable ? questButton(quest.name, quest.id, actions) : el('span', quest.current ? 'current' : undefined, quest.name));
```

9. After `renderComment`, add:

```ts
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
```

10. In `renderState`, replace `root.replaceChildren(renderHeader(state, actions));` with:

```ts
  root.replaceChildren();
  // A new page starts at the top, wherever the last one was scrolled to.
  root.scrollTop = 0;
  if (state.trail && state.trail.length > 0) root.append(renderTrail(state, state.trail, actions));
  root.append(renderHeader(state, actions));
```

    Then, in its ready part, replace the section, chain and comments lines with:

```ts
  if (info.kind === 'item') root.append(...info.sections.map((section) => renderSection(section, actions)));
  else if (info.chain.length > 0) root.append(renderChain(info.chain, actions));
  if (info.comments.length > 0) root.append(renderComments(info, actions));
```

11. Replace the bootstrap at the end of the file (from `const bridge = window.gatherer;` down) with:

```ts
// In the app, the preload script supplies the bridge; tests call renderState directly.
const bridge = window.gatherer;
const root = document.getElementById('popup');
if (bridge && root) {
  const actions: PopupActions = {
    close: () => bridge.close(),
    openWowhead: () => bridge.openWowhead(),
    openQuest: (id) => bridge.openQuest(id),
    goBack: (index) => bridge.goBack(index),
    // Once laid out, ask the window to fit the content (main keeps it within limits).
    resized: () => requestAnimationFrame(() => bridge.reportHeight(contentHeight(root))),
  };
  bridge.onState((state) => {
    renderState(root, state, actions);
    actions.resized();
  });
}
```

In `app/static/popup.css`, add before the `/* Item quality colours` comment:

```css
/* The breadcrumb above the title: earlier pages are links back. */
.trail { margin: 0 0 6px; font-size: 12px; color: var(--muted); }
.trail .sep { margin: 0 5px; }
.trail .here { color: var(--text); }

/* Quest names and breadcrumb steps the player can click: text with a dotted
   underline, gold on hover. They undo the red button look. */
button.quest-link, button.crumb {
  font: inherit; color: inherit; text-align: left; cursor: pointer;
  padding: 0; background: none; border: none; border-radius: 0; box-shadow: none;
  text-decoration: underline dotted rgba(255, 255, 255, 0.45); text-underline-offset: 3px;
}
button.quest-link:hover, button.quest-link:active, button.crumb:hover, button.crumb:active { color: var(--gold); background: none; }

.more-comments { display: block; margin: 8px auto 0; }
```

- [ ] **Step 4: Run the tests and the type check**

Run: `cd app && npm run typecheck && npx vitest run`
Expected: `tsc` prints nothing; `Tests 210 passed (210)`.

- [ ] **Step 5: Commit**

```bash
git add app/src/renderer/popup.ts app/static/popup.css app/test/popup.test.ts
git commit -m "feat(app): click through quests with a breadcrumb, and show comments five more at a time" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: End to end, notes, and the program

**Files:**
- Modify: `CLAUDE.md`
- Throwaway, uncommitted: `$SCRATCH/preview-nav.cjs`
- Rebuild: `app/release/Wowhead Gatherer 0.1.0.exe`

**Interfaces:**
- Consumes: everything above.
- Produces: proof that clicks in a real popup window reach the main process, a rendered look check, notes, and the rebuilt program.

- [ ] **Step 1: Click inside a real popup window**

Write `$SCRATCH/preview-nav.cjs`:

```js
// Throwaway: loads the built popup with a quest page, clicks inside it, and reports
// what reached the main process, then saves screenshots.
// Usage: electron preview-nav.cjs <app folder> <output folder>
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

const [appDir, outDir] = process.argv.slice(-2);
const link = { url: 'https://www.wowhead.com/tbc/quest=10482', site: 'tbc', lang: '', kind: 'quest', id: 10482 };
const comment = (i) => ({ user: `Player${i}`, rating: 20 - i, date: 'Jan 2008', body: [{ kind: 'text', text: `Comment number ${i + 1}: the orcs are north of Honor Hold.` }] });
const state = {
  kind: 'ready', link, trail: ["Duron's Report", 'Arrival in Outland'],
  info: { kind: 'quest', name: 'Fel Orc Scavengers', quality: 1, icon: 'inv_misc_note_01', commentTotal: 9,
    chain: [
      { position: 1, quests: [{ id: 10160, name: 'Know your Enemy', current: false }] },
      { position: 2, quests: [{ id: 10482, name: 'Fel Orc Scavengers', current: true }] },
      { position: 3, quests: [{ id: 10483, name: 'Ill Omens', current: false }] } ],
    comments: Array.from({ length: 9 }, (_, i) => comment(i)) },
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 420, height: 560, show: false, frame: false, transparent: true, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(appDir, 'dist', 'preload.js'), contextIsolation: true, sandbox: true, offscreen: true },
  });
  for (const channel of ['popup:open-quest', 'popup:go-back', 'popup:height']) {
    ipcMain.on(channel, (_event, value) => console.log('RECEIVED', channel, JSON.stringify(value)));
  }
  await win.loadFile(path.join(appDir, 'static', 'popup.html'));
  win.webContents.send('popup:state', state);
  await wait(1500);
  fs.writeFileSync(path.join(outDir, 'nav-1.png'), (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript("document.querySelector('.chain button.quest-link').click()");
  await win.webContents.executeJavaScript("document.querySelectorAll('.trail .crumb')[1].click()");
  await win.webContents.executeJavaScript("document.querySelector('.more-comments').click()");
  await wait(800);
  fs.writeFileSync(path.join(outDir, 'nav-2.png'), (await win.webContents.capturePage()).toPNG());
  app.quit();
});
```

Run (from `app/`, after `npm run build`):

```bash
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron "$SCRATCH/preview-nav.cjs" "$(pwd)" "$SCRATCH"
```

Expected output, among Chromium's noise:
- `RECEIVED popup:open-quest 10160`
- `RECEIVED popup:go-back 1`
- at least one `RECEIVED popup:height <number>`, from the first render and from the click on "Show 5 more comments".

Look at `nav-1.png` and `nav-2.png` with the Read tool.
- **`nav-1.png`:**
  - the breadcrumb (`Duron's Report › Arrival in Outland › Fel Orc Scavengers`) above the title;
  - "Know your Enemy" and "Ill Omens" with dotted underlines;
  - "Fel Orc Scavengers" in gold;
  - 3 comments and a "Show 5 more comments" button.
- **`nav-2.png`:** 8 comments and "Show 1 more comment".

If something looks clearly wrong, fix the CSS, rebuild and run again. Record a ruling for any change.

- [ ] **Step 2: Update the notes**

In `CLAUDE.md`, in the "App files" table:

- After the `main/questPage.ts, main/questInfo.ts` row, add:

```
| `main/trail.ts`, `shared/pageName.ts` | The pages clicked through in the popup (`Trail`): it opens only quests the page on show lets the player click, builds their addresses itself, and goes back along the breadcrumb. `pageName` names a page. |
```

- Change the `main/placement.ts, main/popupWindow.ts, renderer/popup.ts, preload/preload.ts` row's role to: "The overlay. The page sends only numbers back (a quest ID, a breadcrumb index, its height); `popupWindow.ts` takes them only from its own page. Comments show 3, then 5 more per click."

In the opening paragraph, after "for both, the best comments,", add "with quests in a chain or an item's Starts quest / Needed for lists clickable, and a breadcrumb back,".

- [ ] **Step 3: Run every check**

Run (repo root): `.venv/Scripts/python -m pytest tests -q`
Expected: `156 passed`.

Run: `cd app && npm run typecheck && npx vitest run`
Expected: `tsc` prints nothing; `Tests 210 passed (210)`.

- [ ] **Step 4: Rebuild the program**

First make sure no copy of the app is running, since a running one locks the file. Check with PowerShell: `Get-Process | Where-Object { $_.ProcessName -like '*Wowhead*' }`. If one is running and this session didn't start it, stop and ask the player before closing it.

Run: `cd app && npm run dist` (in the background; it takes a few minutes).
Expected: electron-builder ends with no error, and `app/release/Wowhead Gatherer 0.1.0.exe` has today's time.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: notes for clicking through quests and paging comments" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

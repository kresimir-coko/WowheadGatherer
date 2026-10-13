# 0.4.0 (Pin and Move, Long Chains, Sticky Header, Fixes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Pin the popup and drag it anywhere, with a header that stays at the top while the rest scrolls.
- Show long quest chains from Questie's database, and the quest's Wowhead guides.
- Fix every small issue the reviews deferred.
- Release 0.4.0 and push it to `main`.

**Architecture:**
- **The add-on:** it reads the chain from `LibQuestieDB` and appends it to quest links after `#chain=`.
- **The app's data:** it parses that fragment into `link.chain`. A shared `chainFor(state)` picks Questie's chain or Wowhead's Series box. Quest pages also yield `guides`.
- **Navigation:** the trail carries chains onward, names the loading page, and validates guide opens.
- **Network:** fixes in the client, browserFetch, the session and the cache.
- **The window:** it gets a pinned state, a kept position (`keepOnScreen`) and suspend/resume. The renderer gets a sticky `.top` bar with a Pin button.

**Tech Stack:** Lua 5.1 + pytest/lupa; Electron 44, TypeScript 7, Vitest 5, happy-dom.

**Spec:** `docs/superpowers/specs/2026-10-13-pin-chains-fixes-design.md`.

## Global Constraints

- **WoW Forever first, TBC too.** Every client- or Questie-specific call is guarded. Questie calls go through `pcall`.
- **The link contract:** `https://www.wowhead.com/[site/][lang/]<item|quest|spell>=<id>[#chain=<id>~<name>(.<id>~<name>)*]`.
  - Names are percent-encoded byte by byte; letters, digits, `-` and `_` are kept as they are.
  - At most 25 quests before and 25 after.
  - The app reads at most 51 entries and names of at most 100 characters.
  - The longest clipboard text read is 6,000 characters.
- **Pages:** guides are kept only when their `url` matches `^https://www\.wowhead\.com/[\w/.-]+$`, at most 3 per quest. The cache version goes to 4.
- **Popup:** the minimum height is 64 px. While pinned there is no Escape shortcut, and the popup suspends (hides and keeps its page) when another program comes to the front. × unpins.
- **Security:** the page sends only booleans and numbers: `setPinned(boolean)`, `openGuide(index)`, `openQuest(id)`, `goBack(index)`. The main process validates each against the page on show and takes IPC only from the popup's own webContents. Wowhead text goes into the DOM only as text.
- **Politeness:** one request per lookup, nothing fetched ahead. A lookup already in flight is shared.
- **Release:** version 0.4.0, rebuild the exe, then:
  - `git checkout main && git merge --ff-only feat/pin-and-chains`;
  - `git push origin main feat/pin-and-chains`, never forced.
- **Commands:**
  - Add-on: `.venv/Scripts/python -m pytest tests -q`.
  - App: `npx vitest run` and `npm run typecheck` (from `app/`, with `export PATH="/c/Program Files/nodejs:$PATH"`).
  - Electron: `env -u ELECTRON_RUN_AS_NODE`.
  - **Edits with backslashes** use the editor, not shell scripts.
- **Commits:** Conventional Commits ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

These are the inputs the spec implies but its happy paths don't exercise. Each one has a test in the task named.

1. **A hostile or broken chain fragment** (bad percent-encoding, IDs 0 or negative, 1,000 entries, HTML in names) → broken entries are skipped, the list is capped, and names stay text. *Task 2 (`skips broken chain entries`, `caps the chain`) and Task 2's renderer test (`never turns chain names into HTML`).*
2. **Clicking a quest from Wowhead's Series box while a Questie chain is on show, and the other way round** → the chain is carried only to quests that are in it. *Task 3 (`carries the chain only to quests in it`).*
3. **Questie returning odd values** (non-tables, a cycle, an error) → no Lua error, no quest listed twice. *Task 1 (`test_chain_survives_cycles_and_odd_values`, `test_questie_error_means_no_chain`).*
4. **Two lookups of the same page at once** → one request, each answered with its own link (and chain). *Task 4 (`shares a lookup that is in flight`).*
5. **A pinned popup whose lookup finishes while the game isn't in front** → the result is kept and shown when the game returns. *Task 5's Electron check (step "Check the window in Electron").*

---

### Task 1: The add-on — Questie chains, longer links, re-ready on scroll, chat-link names, comments

**Files:**
- Modify: `Quests.lua`, `ReadyCopy.lua`, `Popup.lua`, `Core.lua`, `Url.lua`, `Lookup.lua`, `tests/conftest.py`
- Create: `tests/test_quest_chain.py`
- Test: `tests/test_ready_copy.py`, `tests/test_quests.py`

**Interfaces:**
- Produces:
  - `ns.QuestChain(questID) → { id, … } | nil`;
  - `ns.QuestChainFragment(questID) → "#chain=…" | ""`;
  - `ns:LookupURL(kind, id) → url`, which ReadyCopy and Core use instead of `BuildURL(…, WOW_PROJECT_ID, locale)`.
  - Test stubs: the fake frames record `SetMaxLetters` as `maxLetters`, and `ItemRefTooltipTextLeft1 = FakeRegion()`.

- [ ] **Step 1: Test stubs.** In `tests/conftest.py`:
  - In `CreateFrame`, add `rawset(frame, "SetMaxLetters", function(self, n) rawset(self, "maxLetters", n) end)`.
  - At the end of the stubs, add `ItemRefTooltipTextLeft1 = FakeRegion()`.

- [ ] **Step 2: Write the failing tests.** Create `tests/test_quest_chain.py`:

```python
import pytest

QUESTIE = """
questieQuests = {
    [9824] = { name = "Arcane Disturbances" },
    [9825] = { name = "Restless Activity", preQuestSingle = { 9824 } },
    [9826] = { name = "Contact from Dalaran", preQuestSingle = { 9825 } },
    [9831] = { name = "Entry Into Karazhan", preQuestGroup = { 9826, 9829 } },
    [9829] = { name = "Khadgar", preQuestSingle = { 9826 } },
    [9836] = { name = "The Master's Touch", preQuestSingle = { 9831 }, nextQuestInChain = 9837 },
    [9837] = { name = "Return to Khadgar", nextQuestInChain = 9838 },
    [9838] = { name = "The Violet Eye" },
}
LibQuestieDB = { Quest = { Get = function(id, key) local q = questieQuests[id]; return q and q[key] end } }
"""


@pytest.fixture
def addon(addon):
    addon.run(QUESTIE)
    addon.load_all()
    addon.fire("ADDON_LOADED", "WowheadGatherer")
    return addon


def chain(addon, quest_id):
    result = addon.run(f"return ns.QuestChain({quest_id})")
    return None if result is None else list(result.values())


def test_chain_lists_earlier_quests_first_then_later(addon):
    # Each quest comes after the ones it needs; then nextQuestInChain onward.
    assert chain(addon, 9836) == [9824, 9825, 9826, 9829, 9831, 9836, 9837, 9838]


def test_chain_survives_cycles_and_odd_values(addon):
    addon.run("""
        questieQuests[9824].preQuestSingle = { 9826, -5, "x", 0 }
        questieQuests[9838].nextQuestInChain = 9836
        questieQuests[9825].preQuestGroup = "not a table"
    """)
    result = chain(addon, 9836)
    assert len(result) == len(set(result))
    assert result[-3:] == [9836, 9837, 9838]


def test_chain_keeps_the_nearest_25_each_way(addon):
    addon.run("""
        questieQuests = {}
        for id = 1, 61 do
            questieQuests[id] = { name = "Q" .. id, preQuestSingle = id > 1 and { id - 1 } or nil,
                                  nextQuestInChain = id < 61 and id + 1 or nil }
        end
    """)
    assert chain(addon, 31) == list(range(6, 57))


def test_no_chain_without_questie(addon):
    addon.run("LibQuestieDB = nil")
    assert chain(addon, 9836) is None


def test_no_chain_for_a_lone_quest(addon):
    addon.run('questieQuests[1] = { name = "Alone" }')
    assert chain(addon, 1) is None


def test_questie_error_means_no_chain(addon):
    addon.run('LibQuestieDB.Quest.Get = function() error("broken") end')
    assert chain(addon, 9836) is None


def test_fragment_encodes_the_names(addon):
    addon.run('questieQuests[9825].name = "Plünderer der Höllenorcs"')
    fragment = addon.run("return ns.QuestChainFragment(9825)")
    assert fragment == "#chain=9824~Arcane%20Disturbances.9825~Pl%C3%BCnderer%20der%20H%C3%B6llenorcs"


def test_quest_links_carry_their_chain_and_items_do_not(addon):
    assert addon.run('return ns:LookupURL("quest", 9837)') == (
        "https://www.wowhead.com/tbc/quest=9837#chain=9824~Arcane%20Disturbances.9825~Restless%20Activity"
        ".9826~Contact%20from%20Dalaran.9829~Khadgar.9831~Entry%20Into%20Karazhan"
        ".9836~The%20Master%27s%20Touch.9837~Return%20to%20Khadgar.9838~The%20Violet%20Eye")
    assert addon.run('return ns:LookupURL("item", 19019)') == "https://www.wowhead.com/tbc/item=19019"
```

  The last test needs 9837 to reach back through 9836. Add `preQuestSingle = { 9836 }` to 9837 in `QUESTIE`, and to 9838 `preQuestSingle = { 9837 }`.

  Append to `tests/test_ready_copy.py`:

```python
def test_scrolling_with_ctrl_held_readies_the_next_quest(addon):
    hover_quest_title(addon)
    hold_ctrl(addon)
    addon.run('questLog[2] = { title = "Know your Enemy", questID = 10160, objectives = 1 }; questLogOffset = 1')
    frame(addon)
    assert ready_url(addon) == "https://www.wowhead.com/tbc/quest=10160"


def test_ready_box_takes_long_links(addon):
    hold_ctrl(addon)
    assert ready_box(addon).maxLetters == 0
```

  Append to `tests/test_quests.py`:

```python
def test_chat_link_name_from_the_tooltip(addon):
    # The client hasn't cached the quest; the tooltip's first line still names it.
    addon.g.ItemRefTooltip = addon.tooltip(mouseOver=True)
    log_in(addon)
    addon.run('ItemRefTooltipTextLeft1:SetText("Fel Orc Scavengers"); ItemRefTooltip:SetHyperlink("quest:10482:58")')
    assert hovered(addon) == FEL_ORC


def test_closing_the_chat_link_tooltip_forgets_it(chat_link):
    chat_link.run_hook(chat_link.g.ItemRefTooltip, "OnHide")
    assert hovered(chat_link) is None
```

  Also append to `tests/test_popup.py`: `def test_link_box_takes_long_links(popup): assert popup.box.maxLetters == 0`.

- [ ] **Step 3: Run them to see them fail.** Run `.venv/Scripts/python -m pytest tests -q`. Expected: the new tests fail; the old 175 pass.

- [ ] **Step 4: Implement.**

**`Quests.lua`.** After `ns.QuestTitle`, add:

```lua
-- How many earlier and how many later quests a chain lists.
local MAX_CHAIN_SIDE = 25

-- A field of a quest from Questie's database (QuestieDB's public LibQuestieDB),
-- or nil when Questie isn't there or fails.
local function QuestieField(questID, key)
    local lib = _G.LibQuestieDB
    local quests = lib and lib.Quest
    if not (quests and type(quests.Get) == "function") then
        return nil
    end
    local ok, value = pcall(quests.Get, questID, key)
    if ok then
        return value
    end
end

-- The quests that come before questID: Questie's preQuestGroup (all of these)
-- and preQuestSingle (one of these). Negative IDs mark exclusions, not quests.
local function Prerequisites(questID)
    local found = {}
    for _, key in ipairs({ "preQuestGroup", "preQuestSingle" }) do
        local list = QuestieField(questID, key)
        if type(list) == "table" then
            for _, id in ipairs(list) do
                if type(id) == "number" and id > 0 then
                    found[#found + 1] = id
                end
            end
        end
    end
    return found
end

-- The quest's whole chain from Questie, oldest first: the nearest earlier quests
-- by prerequisite (each after the ones it needs), the quest, then the later ones
-- by nextQuestInChain. Nil without Questie, or when the quest stands alone.
function ns.QuestChain(questID)
    local seen = { [questID] = true }
    -- The nearest earlier quests, found breadth-first...
    local found, queue, head, count = {}, { questID }, 1, 0
    while queue[head] and count < MAX_CHAIN_SIDE do
        for _, pre in ipairs(Prerequisites(queue[head])) do
            if not seen[pre] and count < MAX_CHAIN_SIDE then
                seen[pre], found[pre] = true, true
                count = count + 1
                queue[#queue + 1] = pre
            end
        end
        head = head + 1
    end
    -- ...then listed so each comes after the quests it needs.
    local chain, placed = {}, {}
    local function place(id)
        for _, pre in ipairs(Prerequisites(id)) do
            if found[pre] and not placed[pre] then
                placed[pre] = true
                place(pre)
                chain[#chain + 1] = pre
            end
        end
    end
    place(questID)
    chain[#chain + 1] = questID
    local later, nextID = 0, QuestieField(questID, "nextQuestInChain")
    while type(nextID) == "number" and nextID > 0 and not seen[nextID] and later < MAX_CHAIN_SIDE do
        seen[nextID] = true
        chain[#chain + 1] = nextID
        later = later + 1
        nextID = QuestieField(nextID, "nextQuestInChain")
    end
    if #chain == 1 then
        return nil
    end
    return chain
end

-- Percent-encodes text byte by byte, keeping letters, digits, "-" and "_".
local function Encode(text)
    return (tostring(text):gsub("[^%w%-_]", function(c)
        return string.format("%%%02X", c:byte())
    end))
end

-- "#chain=9824~Arcane%20Disturbances.9825~…" for a quest with a Questie chain, or "".
-- A browser ignores everything after "#"; the app reads it.
function ns.QuestChainFragment(questID)
    local chain = ns.QuestChain(questID)
    if not chain then
        return ""
    end
    local entries = {}
    for i, id in ipairs(chain) do
        entries[i] = id .. "~" .. Encode(QuestieField(id, "name") or ("Quest " .. id))
    end
    return "#chain=" .. table.concat(entries, ".")
end

-- The Wowhead address a lookup copies: for a quest, with its Questie chain after "#".
function ns:LookupURL(kind, id)
    local url = ns.BuildURL(kind, id, WOW_PROJECT_ID, self:GetWowheadLocale())
    if kind == "quest" then
        url = url .. ns.QuestChainFragment(id)
    end
    return url
end
```

  Also in `Quests.lua`:
  - Add `local chatLinkName` next to `chatLinkQuest`.
  - In `GetHoveredQuest`, the chat branch returns `chatLinkQuest, ns.QuestTitle(chatLinkQuest) or chatLinkName`.
  - In `InitializeQuests`, the `SetHyperlink` hook sets both:

```lua
        hooksecurefunc(ItemRefTooltip, "SetHyperlink", function(_, link)
            chatLinkQuest = ns.ParseQuestLink(link)
            -- The client may not have the quest's name yet; the tooltip's first line does.
            local line = _G.ItemRefTooltipTextLeft1
            chatLinkName = chatLinkQuest and line and line:GetText() or nil
        end)
        if ItemRefTooltip.HookScript then
            ItemRefTooltip:HookScript("OnHide", function()
                chatLinkQuest, chatLinkName = nil, nil
            end)
        end
```

**`ReadyCopy.lua`.**
- `CreateReadyBox` adds `editBox:SetMaxLetters(0)` (comment: "A quest's link carries its whole chain").
- Its `OnUpdate` becomes:

```lua
    editBox:SetScript("OnUpdate", function()
        if readyKind ~= "quest" then
            return
        end
        local questID = ns.GetHoveredQuest()
        if questID == readyID then
            return
        end
        -- The wheel scrolled another quest under the cursor, or the cursor left.
        if questID and IsReadyKeyDown() and not letGo then
            ns:ReadyCopy()
        else
            ns:UnreadyCopy()
        end
    end)
```

- `ns:ReadyCopy` builds `readyURL = self:LookupURL(kind, id)`.
- The comments that say "item or quest" say "item, quest or spell".

**`Core.lua`:**
- `LookupHovered` calls `self:ShowCopyPopup(self:LookupURL(kind, id), kind, id, label)`.
- The `readyCopy` default's comment says "item, quest or spell".

**`Popup.lua`:**
- `CreatePopup`'s box adds `box:SetMaxLetters(0)`.
- Its `OnKeyDown` comment says "item, quest or spell".

**`Url.lua`:** `BuildURL`'s comment says `(kind "item", "quest" or "spell")`.

**`Lookup.lua`:** the `SpellIcon`/`SpellName` comment becomes "C_Spell, which Forever and TBC 2.5.6 both have; the old globals for clients without it."

- [ ] **Step 5: Run the suite.** Expected: everything passes (175 + the new tests).

- [ ] **Step 6: Commit.**

```bash
git add Quests.lua ReadyCopy.lua Popup.lua Core.lua Url.lua Lookup.lua tests
git commit -m "feat(addon): quest links carry their Questie chain; scroll re-readies; chat-link names" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The app's data — chain fragments, `chainFor`, guides, rendering them

**Files:**
- Modify: `app/src/shared/wowheadLink.ts`, `app/src/shared/types.ts`, `app/src/main/questInfo.ts`, `app/src/main/wowheadClient.ts` (CACHE_VERSION 4), `app/src/renderer/popup.ts`, `app/static/popup.css`
- Create: `app/src/shared/chain.ts`, `app/test/chain.test.ts`
- Test: `app/test/wowheadLink.test.ts`, `app/test/questInfo.test.ts`, `app/test/popup.test.ts`

**Interfaces:**
- Produces:
  - `ChainEntry { id: number; name: string }` and `WowheadLink.chain?: ChainEntry[]`.
  - `Guide { title: string; url: string }` and `QuestInfo.guides: Guide[]`.
  - `chainFor(state: PopupState): ChainStep[]`.
  - `PopupActions.openGuide(index: number)`.

- [ ] **Step 1: Write the failing tests.**

  **`wowheadLink.test.ts`:**

```ts
describe('chains from Questie', () => {
  const base = 'https://www.wowhead.com/tbc/quest=9836';

  it('reads the chain after #chain=, and keeps the address plain', () => {
    const link = parseWowheadLink(`${base}#chain=9824~Arcane%20Disturbances.9836~The%20Master%27s%20Touch`);
    expect(link?.url).toBe(base);
    expect(link?.chain).toEqual([{ id: 9824, name: 'Arcane Disturbances' }, { id: 9836, name: "The Master's Touch" }]);
  });

  it('skips broken chain entries', () => {
    const link = parseWowheadLink(`${base}#chain=x~A.0~B.-3~C.12~%E0%A4%A.13~.14~Fine.15~Also%20fine`);
    expect(link?.chain).toEqual([{ id: 14, name: 'Fine' }, { id: 15, name: 'Also fine' }]);
  });

  it('caps the chain at 51 quests and names at 100 characters', () => {
    const entries = Array.from({ length: 80 }, (_, i) => `${i + 1}~${'N'.repeat(150)}`).join('.');
    const link = parseWowheadLink(`${base}#chain=${entries}`);
    expect(link?.chain).toHaveLength(51);
    expect(link?.chain?.[0].name).toHaveLength(100);
  });

  it('has no chain for one quest, an item, or no fragment', () => {
    expect(parseWowheadLink(`${base}#chain=9836~Alone`)?.chain).toBeUndefined();
    expect(parseWowheadLink('https://www.wowhead.com/tbc/item=19019#chain=1~A.2~B')?.chain).toBeUndefined();
    expect(parseWowheadLink(base)).not.toHaveProperty('chain');
  });
});
```

  **`questInfo.test.ts`** (fixture `quest-9836.html.gz`):

```ts
  it("The Master's Touch: Wowhead's guides, kept on wowhead.com", () => {
    const quest = info(9836, 'quest-9836.html.gz');
    expect(quest?.guides).toEqual([
      { title: 'Attunements Guide: Attunements Walkthrough, Quests and Locations - TBC Classic', url: 'https://www.wowhead.com/tbc/guide/attunement-dungeons-raids-burning-crusade-classic' },
      { title: 'Black Morass Dungeon Quests Guide for Burning Crusade Classic', url: 'https://www.wowhead.com/tbc/guide/black-morass-dungeon-quest-guide-burning-crusade-classic-wow' },
    ]);
    expect(info(10482, 'quest-10482.html.gz')?.guides).toHaveLength(3);
  });

  it('skips guides that are not on wowhead.com, and keeps 3 at most', () => {
    const rows = [
      { title: 'Elsewhere', url: 'https://evil.example/guide' }, { title: 'A', url: 'https://www.wowhead.com/tbc/guide/a' },
      { title: 'B', url: 'https://www.wowhead.com/tbc/guide/b' }, { title: 'C', url: 'https://www.wowhead.com/tbc/guide/c' },
      { title: 'D', url: 'https://www.wowhead.com/tbc/guide/d' },
    ];
    const page = parseQuestPage(fixture('quest-10482.html.gz'));
    page.data.listviews.set('guides', rows);
    expect(buildQuestInfo(10482, page, zones)?.guides.map((g) => g.title)).toEqual(['A', 'B', 'C']);
  });
```

  **`chain.test.ts`:** `chainFor` gives:
  - the link's Questie chain as steps 1…N, with `current` on the link's ID;
  - Wowhead's chain when the link has none;
  - `[]` for items, spells, loading and errors.

  **`popup.test.ts`:**
  - Every sample `QuestInfo` gets `guides: []`, and `actions` gets `openGuide: vi.fn()`.
  - New tests:
    - "shows the full chain from Questie, every other quest clickable": a link with a 4-quest chain. Positions 1–4, the current quest gold, 3 buttons; clicking one calls `openQuest` with its ID.
    - "lists the guides and opens them": 2 guides; the titles show, and clicking the second calls `openGuide(1)`.
    - "never turns chain or guide names into HTML".

- [ ] **Step 2: Run them to see them fail.**

- [ ] **Step 3: Implement.**

  **`wowheadLink.ts`:**
  - `MAX_LINK_LENGTH = 6000`.
  - The regex's tail becomes the capture group `([/?#]\S*)?$`.
  - Add:

```ts
/** One quest of a chain the add-on read from Questie and put after "#chain=". */
export interface ChainEntry {
  id: number;
  name: string;
}
/** At most this many quests of a chain are read (25 before, the quest, 25 after), and names this long. */
const MAX_CHAIN = 51;
const MAX_CHAIN_NAME = 100;
const CHAIN = /#chain=([^#\s]*)$/;

/** The quests after "#chain=" (id~percent-encoded name, joined by "."); broken entries are skipped. */
function readChain(tail: string | undefined): ChainEntry[] | undefined {
  const match = tail ? CHAIN.exec(tail) : null;
  if (!match) return undefined;
  const entries: ChainEntry[] = [];
  for (const part of match[1].split('.').slice(0, MAX_CHAIN)) {
    const split = part.indexOf('~');
    const id = Number(part.slice(0, split));
    if (split <= 0 || !Number.isSafeInteger(id) || id <= 0) continue;
    let name: string;
    try {
      name = decodeURIComponent(part.slice(split + 1)).trim().slice(0, MAX_CHAIN_NAME);
    } catch {
      continue;
    }
    if (name) entries.push({ id, name });
  }
  return entries.length > 1 ? entries : undefined;
}
```

  …and `parseWowheadLink` ends:

```ts
  const chain = kind === 'quest' ? readChain(match[5]) : undefined;
  const link: WowheadLink = { url: `https://www.wowhead.com/${path}${kind}=${id}`, site, lang, kind, id };
  if (chain) link.chain = chain;
  return link;
```

  `WowheadLink` gains `/** The quest's chain from Questie, when the add-on had one. */ chain?: ChainEntry[];`.

  **`types.ts`:** `Guide { title: string; url: string }`, and `QuestInfo.guides: Guide[]` ("Wowhead's guides for the quest, at most 3, on wowhead.com").

  **`questInfo.ts`:**

```ts
/** Guides shown per quest, and the only addresses a guide may have. */
const MAX_GUIDES = 3;
const GUIDE_URL = /^https:\/\/www\.wowhead\.com\/[\w/.-]+$/;

function readGuides(page: ItemPage): Guide[] {
  return (page.listviews.get('guides') ?? [])
    .flatMap((row) => (typeof row.title === 'string' && typeof row.url === 'string' && GUIDE_URL.test(row.url)
      ? [{ title: row.title.replace(/\s+/g, ' ').trim(), url: row.url }] : []))
    .slice(0, MAX_GUIDES);
}
```

  …and `buildQuestInfo` adds `guides: readGuides(page.data)` (it imports `ItemPage` and `Guide`). `GUIDE_URL` is exported for the trail.

  **`shared/chain.ts`:**

```ts
import type { ChainStep, PopupState } from './types';

/** The chain a quest page shows: the whole one from Questie when the link carries it, else Wowhead's Series box. */
export function chainFor(state: PopupState): ChainStep[] {
  if (state.kind !== 'ready' || state.info.kind !== 'quest') return [];
  const fromQuestie = state.link.chain;
  if (fromQuestie && fromQuestie.length > 1) {
    return fromQuestie.map((quest, i) => ({
      position: i + 1,
      quests: [{ id: quest.id, name: quest.name, current: quest.id === state.link.id }],
    }));
  }
  return state.info.chain;
}
```

  **`popup.ts`:**
  - `PopupActions.openGuide(index: number)`.
  - `renderState` renders `chainFor(state)` instead of `info.chain`.
  - After the chain, a Guides section when `info.guides.length > 0`: `section.guides` > `h2` "Guides" > `ul` > `li` > `button.name.guide-link`, whose click calls `openGuide(index)`.
  - A quest lists nothing when both `chainFor(state)` and `guides` are empty.
  - The bootstrap's actions add `openGuide: (index) => bridge.openGuide(index)`. The bridge method arrives in Task 3, so this line lands there; in this task, cast the bridge or add it in the same commit as Task 3.

  **`popup.css`:** `button.guide-link` shares `button.quest-link`'s rules.

  **`wowheadClient.ts`:** `CACHE_VERSION = 4`, with the comment "4: quest guides".

- [ ] **Step 4: Run tests and the type check.** Commit as `feat(app): long chains from the link, and a quest's Wowhead guides`.

---

### Task 3: Navigation — chains carried on, loading names, opening guides

**Files:**
- Modify: `app/src/main/trail.ts`, `app/src/shared/pageName.ts`, `app/src/shared/types.ts` (loading `name?`), `app/src/main/main.ts`, `app/src/main/popupWindow.ts` (handler `openGuide`), `app/src/preload/preload.ts`
- Test: `app/test/trail.test.ts`

**Interfaces:**
- Produces:
  - `TrailStep = { link: WowheadLink; name: string }`.
  - `Trail.open(current, id): TrailStep | null` and `Trail.back(index): TrailStep | null`.
  - `questLink(from, id)` carries `from.chain` when `id` is in it.
  - `clickableQuestIds` uses `chainFor`.
  - `guideUrl(state, index): string | null`.
  - The loading `PopupState` gains `name?: string`, which `pageName` uses.
  - The bridge gains `openGuide(index)` (IPC `popup:open-guide`), and `PopupHandlers` gains `openGuide(index: unknown)`.

- [ ] **Step 1: Write the failing tests** in `trail.test.ts`:
  - Existing calls change: `open(...)?.url` becomes `open(...)?.link.url`, and `back(0)?.url` becomes `back(0)?.link.url`.
  - New tests:
    - "names the quest it opens": `trail.open(onReport, 10288)?.name` is `'Arrival in Outland'`, and `back(0)?.name` is `"Duron's Report"`.
    - "carries the chain only to quests in it": from a state whose link has a chain [10160, 10482, 10483], opening 10483 keeps the chain. From a state without one, the link has no chain.
    - "lets the player click every other quest of a Questie chain": `clickableQuestIds` of a ready state with a link chain [1, 2, 3], on quest 2, is {1, 3}.
    - "opens only guides the page lists": `guideUrl(state, 0)` is the guide's url; `guideUrl(state, 5)`, `guideUrl(state, '0')` and `guideUrl(null, 0)` are null.
    - "names a loading page by the name it was opened with": `pageName({ kind: 'loading', link, name: 'Know your Enemy' })` is `'Know your Enemy'`.

- [ ] **Step 2: Run them to see them fail.**

- [ ] **Step 3: Implement.**

  **`trail.ts`.** `Step` becomes the exported `TrailStep`. Then:

```ts
export function questLink(from: WowheadLink, id: number): WowheadLink | null {
  const path = [from.site, from.lang].filter(Boolean).map((part) => `${part}/`).join('');
  const link = parseWowheadLink(`https://www.wowhead.com/${path}quest=${id}`);
  // A quest opened from within a Questie chain is part of the same chain.
  if (link && from.chain?.some((quest) => quest.id === id)) link.chain = from.chain;
  return link;
}

/** The name of quest id on the page on show, for the loading title. */
function clickedName(state: PopupState, id: number): string | undefined {
  for (const step of chainFor(state)) for (const quest of step.quests) if (quest.id === id) return quest.name;
  if (state.kind === 'ready' && state.info.kind === 'item') {
    for (const section of state.info.sections) for (const row of section.rows) if (row.questId === id) return row.name;
  }
  return undefined;
}
```

  - `clickableQuestIds` takes chain quests from `chainFor(state)`, and item rows as before.
  - `open` returns `{ link, name: clickedName(current, id) ?? \`Quest ${id}\` }`.
  - `back` returns the step itself.
  - Add:

```ts
/** The address of guide index on the page on show, or null when the page has no such guide. */
export function guideUrl(state: PopupState | null, index: unknown): string | null {
  if (state?.kind !== 'ready' || state.info.kind !== 'quest' || !isIndex(index)) return null;
  const guide = state.info.guides[index];
  return guide && GUIDE_URL.test(guide.url) ? guide.url : null;
}
```

  **`types.ts`:** the loading variant becomes `{ kind: 'loading'; link: WowheadLink; /** The page's name when it's already known (a click inside the popup). */ name?: string }`.

  **`pageName.ts`:** `return headerOf(state)?.name ?? (state.kind === 'loading' ? state.name : undefined) ?? \`${KIND_NAMES[state.link.kind]} ${state.link.id}\`;`

  **`main.ts`:**
  - `goTo(step: TrailStep | null)` replaces with `{ kind: 'loading', link: step.link, name: step.name, trail: trail.names() }`, then looks up `step.link`.
  - The `Popup` handlers gain `openGuide: (index) => { const url = guideUrl(popup.current(), index); if (url) void shell.openExternal(url); }`. Import `shell`.

  **`popupWindow.ts`:** `PopupHandlers.openGuide(index: unknown)`, and `ipcMain.on('popup:open-guide', (event, index: unknown) => fromPopup(event) && this.handlers.openGuide(index))`.

  **`preload.ts`:** `openGuide(index: number): void { ipcRenderer.send('popup:open-guide', index); }`.

- [ ] **Step 4: Run tests, type check and build.** Commit as `feat(app): chains carried on, loading names, opening guides`.

---

### Task 4: Network and cache fixes

**Files:**
- Modify: `app/src/main/wowheadClient.ts`, `app/src/main/browserFetch.ts`, `app/src/main/wowheadSession.ts`, `app/src/main/cache.ts`, `app/src/main/win32.ts`, `app/src/main/main.ts`
- Create: `app/src/main/memoLast.ts`
- Test: `app/test/wowheadClient.test.ts`, `app/test/wowheadSession.test.ts`, `app/test/cache.test.ts`, `app/test/shell.test.ts`

**Interfaces:**
- Produces:
  - `ClientDeps.loadInBrowser(url) → Promise<{ html: string; url: string } | null>`.
  - `isCurrentCacheFile(fileName) → boolean` (exported from `wowheadClient.ts`).
  - `DiskCache.prune(keep: (fileName: string) => boolean, maxAgeMs: number, now?: number): void`.
  - `memoLast<K, V>() → (key: K, compute: () => V) => V`.
  - `withTimeout` is removed, together with its two tests: `fetchText` now aborts instead.

- [ ] **Step 1: Write the failing tests.**

  **`wowheadClient.test.ts`:**
  - `setup`'s `loadInBrowser` returns `browserHtml === null ? null : { html: browserHtml, url: browserUrl ?? url }`. It takes a new optional 4th parameter `browserUrl`.
  - Delete the `withTimeout` describe block and its import.
  - New tests:
    - "shares a lookup that is in flight": two `lookup(GOREHOWL)` calls without awaiting. `asked` holds `GOREHOWL.url` once, and both are ready.
    - "says the item is unknown when the hidden window lands on Wowhead's not-found page": blocked page; the browser gives `item-999999` with url `…/tbc/items?notFound=28773`. The result is `MESSAGES.notFound('item', 28773)`.
    - "does not save a result without zone names": no zones answer. Look up twice; `asked` holds the page twice.

  **`wowheadSession.test.ts`:** `decide({ webContentsId: 3, resourceType: 'subFrame' })` is `true`.

  **`cache.test.ts`:** "prunes old versions and stale files". Write `item-v3-a.json` (fresh), `item-v4-b.json` (fresh), `item-v4-c.json` (saved 8 days ago) and `notes.txt`. Call `prune((name) => name.includes('-v4-'), 7 days)`. Only `item-v4-b.json` and `notes.txt` remain.

  **`shell.test.ts`:** "memoLast computes once per key". Calling with `'a'` twice computes once; `'b'` computes again; `'a'` again computes again.

- [ ] **Step 2: Run them to see them fail.**

- [ ] **Step 3: Implement.**

  **`wowheadClient.ts`:**
  - Add `private readonly inFlight = new Map<string, Promise<PopupState>>();`.
  - `lookup` checks the cache, then the in-flight map; a shared answer is returned as `{ ...state, link }`.
  - Otherwise it runs `this.fetchAndRead(link, key)` (the old body), stores the promise, and deletes it on settle.
  - `read` returns `{ info, zonesKnown: zones.size > 0 }`, and the result is saved only when `zonesKnown`.
  - `fetchPage`'s browser path:

```ts
    const page = await this.deps.loadInBrowser(link.url);
    // Wowhead sends an unknown ID to its search page, in the window as on the network.
    if (page?.url.includes('notFound=')) return { kind: 'not-found' };
    if (page && isCompletePage(page.html)) return { kind: 'html', html: page.html };
```

  - Export:

```ts
/** Whether a cache file belongs to this version; older ones are deleted at start. */
export function isCurrentCacheFile(fileName: string): boolean {
  return fileName.includes(`-v${CACHE_VERSION}-`);
}
```

  - Delete `withTimeout`.

  **`browserFetch.ts`:**
  - `fetchText` uses an `AbortController`, with `setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)` cleared in `finally`, and `signal: controller.signal`.
  - `loadInBrowser` returns `{ html, url: window.webContents.getURL() }`.
  - **Superseded loads:** `let newestLoad = 0;` at module level; each call takes `const load = ++newestLoad`. The poll ends with `finish(null)` when `load !== newestLoad`, with the comment "a newer lookup took over; its answer would be dropped anyway".

  **`wowheadSession.ts`:** `SKIPPED_RESOURCES` adds `'subFrame'`, with the comment "ad frames".

  **`cache.ts`:**

```ts
  /** Deletes the cache's JSON files that keep says no to, and those older than maxAgeMs. */
  prune(keep: (fileName: string) => boolean, maxAgeMs: number, now = Date.now()): void {
    let names: string[];
    try {
      names = fs.readdirSync(this.dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const file = path.join(this.dir, name);
      try {
        const entry = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<Entry<unknown>>;
        const stale = typeof entry.savedAt !== 'number' || now - entry.savedAt > maxAgeMs;
        if (!keep(name) || stale) fs.rmSync(file, { force: true });
      } catch {
        fs.rmSync(file, { force: true });
      }
    }
  }
```

  **`memoLast.ts`:**

```ts
/** Remembers the last answer: compute runs only when the key changes. */
export function memoLast<K, V>(): (key: K, compute: () => V) => V {
  let known = false;
  let lastKey: K | undefined;
  let lastValue: V | undefined;
  return (key, compute) => {
    if (!known || key !== lastKey) {
      lastValue = compute();
      lastKey = key;
      known = true;
    }
    return lastValue as V;
  };
}
```

  **`win32.ts`:** `foregroundExeName` keys on `window ? koffi.address(window) : 0n` through a module-level `memoLast<bigint, string>()`. The program is looked up only when the foreground window changes. The old body becomes `exeNameOf(window)`.

  **`main.ts`:** after creating the cache, `cache.prune(isCurrentCacheFile, ZONES_MAX_AGE_MS)`. Keep the `DiskCache` in a `const`.

- [ ] **Step 4: Run tests, type check and build.** Commit as `fix(app): share in-flight lookups, end superseded loads, cancel timed-out requests, prune the cache, and more`.

---

### Task 5: The window — sticky bar, pin, move, minimum height, font re-fit, missing tests

**Files:**
- Modify: `app/src/renderer/popup.ts`, `app/static/popup.css`, `app/src/shared/types.ts` (`pinned?`), `app/src/main/placement.ts`, `app/src/main/popupWindow.ts`, `app/src/main/main.ts`, `app/src/preload/preload.ts`
- Test: `app/test/popup.test.ts`, `app/test/placement.test.ts`, `app/test/static.test.ts`

**Interfaces:**
- Produces:
  - `PopupState.pinned?: boolean` (set by the main process).
  - `PopupActions.setPinned(pinned: boolean)`; the bridge's `setPinned` (IPC `popup:pin`).
  - `POPUP_MIN_HEIGHT = 64`.
  - `keepOnScreen(position: Point, size: Size, area: Rect): Point`.
  - `refitWhenFontsLoad(fonts: { ready: Promise<unknown> } | undefined, resized: () => void): void`.
  - On `Popup`: `setPinned(on)`, `isPinned()`, `suspend()` and `resume()`.

- [ ] **Step 1: Write the failing tests.**

  **`popup.test.ts`:**
  - `actions` gets `setPinned: vi.fn()`.
  - "keeps the breadcrumb and the title row in the sticky bar": `.top > .trail` and `.top > header` both exist.
  - "pins and unpins": without `pinned`, the `.pin` text is 'Pin', and a click calls `setPinned(true)`. With `pinned: true`, it's 'Pinned', it has the class `pinned`, and a click calls `setPinned(false)`.
  - "shows an error under the breadcrumb": an error state with `trail: ['Fel Orc Scavengers']` has the `.trail .crumb` and the `.status.error`.
  - "never turns a clickable quest name into HTML": a chain whose non-current quest has an `<img onerror>` name. Its `button.quest-link` text is that name, and the only `img` is the icon.
  - "re-fits once fonts are ready": `refitWhenFontsLoad({ ready: Promise.resolve() }, resized)`, then `await` a tick; `resized` was called once. With `undefined` fonts, nothing is called.

  **`placement.test.ts`:**
  - `fitHeight(20, 300, false)` is 64.
  - `keepOnScreen({ x: 1800, y: 900 }, { width: 420, height: 300 }, SCREEN)` is `{ x: 1500, y: 780 }`.
  - `keepOnScreen({ x: 100, y: 100 }, SIZE, SCREEN)` is unchanged.

  **`static.test.ts`:** "makes the top bar sticky and draggable, its controls clickable". The CSS contains a `.top` rule with `position: sticky` and `-webkit-app-region: drag`, and a rule for `.top button` with `-webkit-app-region: no-drag`.

- [ ] **Step 2: Run them to see them fail.**

- [ ] **Step 3: Implement.**

  **`popup.ts`:**
  - `renderState` puts the trail (when there is one) and the header in `div.top`.
  - `renderHeader` adds, between Open and ×:

```ts
  const pin = el('button', state.pinned ? 'pin pinned' : 'pin', state.pinned ? 'Pinned' : 'Pin');
  pin.title = state.pinned ? 'Unpin: Escape and switching away close it again' : 'Keep it open while you play';
  pin.addEventListener('click', () => actions.setPinned(!state.pinned));
```

  - Export:

```ts
/** Asks for a re-fit once the page's fonts have loaded: the first popup is laid out with the fallback font. */
export function refitWhenFontsLoad(fonts: { ready: Promise<unknown> } | undefined, resized: () => void): void {
  fonts?.ready.then(resized, () => {});
}
```

  - The bootstrap:
    - adds `setPinned: (pinned) => bridge.setPinned(pinned)` and `openGuide: (index) => bridge.openGuide(index)` to `actions`;
    - calls `void document.fonts?.load("14px 'Marcellus'")` once at start;
    - calls `refitWhenFontsLoad(document.fonts, actions.resized)` after each render.

  **`popup.css`:**

```css
/* The breadcrumb and the title row stay at the top while the rest scrolls, and
   dragging them moves the popup. Their buttons and links stay clickable. */
.top {
  position: sticky; top: -10px; z-index: 1;
  margin: -10px -12px 0; padding: 10px 12px 8px;
  background: #24130b; border-bottom: 1px solid var(--inset-rim); border-radius: 6px 6px 0 0;
  -webkit-app-region: drag;
}
.top button { -webkit-app-region: no-drag; }
.pin.pinned { background: linear-gradient(to bottom, #6a5a1a, #3a3008); }
```

  **`placement.ts`:** `POPUP_MIN_HEIGHT = 64`. Add:

```ts
/** A position moved just enough for a window of size to stay on the screen. */
export function keepOnScreen(position: Point, size: Size, area: Rect): Point {
  return {
    x: Math.round(clamp(position.x, area.x, area.x + area.width - size.width)),
    y: Math.round(clamp(position.y, area.y, area.y + area.height - size.height)),
  };
}
```

  **`popupWindow.ts`.** The window is `movable: true`. The class adds:
  - `private pinned = false`, `private suspended = false`, and `private position: Point | null = null`, the window's top-left once placed.
  - `this.window.on('moved', () => { const [x, y] = this.window.getPosition(); this.position = { x, y }; })`.
  - `ipcMain.on('popup:pin', (event, on: unknown) => fromPopup(event) && typeof on === 'boolean' && this.setPinned(on))`.
  - `open(state)`: unless pinned, `this.anchor = screen.getCursorScreenPoint(); this.position = null;`. Then `holdHeight = false`, then `show`.
  - `update(state)`: return unless `(this.window.isVisible() || this.suspended)` and the URLs match; otherwise `holdHeight = false` and `show`.
  - `show(state)`:
    - `this.state = { ...state, pinned: this.pinned }`, then send it.
    - If `this.suspended`, return.
    - `place()`; if not visible, `showInactive()`, and register Escape only when not pinned.
  - `place()`:
    - Compute `size`.
    - `this.position = this.position ? keepOnScreen(this.position, size, area) : placePopup(this.anchor, size, area)`. `area` is the work area of the display nearest the current position, or the anchor.
    - `setBounds`.
  - `setPinned(on)`:
    - `this.pinned = on`.
    - Pinned: `globalShortcut.unregister('Escape')`. Unpinned and visible: register it again.
    - Then, if there's a state, `show(this.state)`, so the button updates.
  - `isPinned()`.
  - `suspend()`: when visible, `this.window.hide(); this.suspended = true`.
  - `resume()`: when suspended, `this.suspended = false; this.window.showInactive()`.
  - `hide()` also resets `pinned`, `suspended` and `position` (× unpins). It still calls `closed()`.
  - The `openOnWowhead` comment: "only the address of the page on show, as parseWowheadLink rebuilt it".

  **`main.ts`:** `onForeground` becomes:

```ts
    onForeground: (gameInFront, exeName) => {
      if (gameInFront) {
        popup.resume();
        return;
      }
      // Another program in front: a pinned popup waits for the game; any other closes.
      if (exeName === '' || exeName.toLowerCase() === ownExe) return;
      if (popup.isPinned()) popup.suspend();
      else popup.hide();
    },
```

  **`preload.ts`:** `setPinned(pinned: boolean): void { ipcRenderer.send('popup:pin', pinned); }`.

- [ ] **Step 4: Run tests, type check and build.**

- [ ] **Step 5: Check the window in Electron.** Write a throwaway harness in `$SCRATCH`, like the navigation one. It runs the real `Popup`, `Trail` and `latestOnly` with main's wiring and a fake client, and with clicks done by `executeJavaScript`. It logs:
  - Pin: `isPinned()` is true, and the state's `pinned` is true.
  - `suspend()`, then a lookup finishing: `current()` holds the result and the window is hidden. After `resume()` it's visible again.
  - × unpins and closes.
  - Moving the window programmatically (`setPosition`) and growing the page keeps x.

  Then render the popup with a long page, scrolled, to check the sticky bar.

- [ ] **Step 6: Commit** as `feat(app): pin and move the popup; the header stays on top`.

---

### Task 6: Texts, notes, version 0.4.0

**Files:**
- Modify: `app/src/main/main.ts` (tray text), `app/package.json` (description, version), `app/package-lock.json`, `WowheadGatherer.toc`, `CLAUDE.md`, `app/src/shared/types.ts` (icon example)

- [ ] **Step 1: Texts.**
  - **The tray tooltip:** `'Wowhead Gatherer: hold Ctrl over an item, quest or spell in WoW and press C'`.
  - **The package description:** "…for the item, quest or spell you copy in World of Warcraft."
  - **types.ts:** the icon example "quest-start" becomes "inv_misc_note_01".
  - **CLAUDE.md:**
    - The contract line becomes `https://www.wowhead.com/[site/][lang/]<item|quest|spell>=<id>[#chain=…]`.
    - The two-halves lines name spells.
    - The `Quests.lua` row mentions `ns.QuestChain`, `QuestChainFragment` and `LookupURL` (with LibQuestieDB).
    - New rows: `shared/chain.ts` (`chainFor`) and `memoLast.ts`.
    - The overlay row mentions pin, move and the sticky bar.
    - The program's name becomes `0.4.0`.
    - "Designs:" lists the 2026-10-10 navigation design and the 2026-10-13 designs.
- [ ] **Step 2: Version.** `cd app && npm version 0.4.0 --no-git-tag-version`, and `## Version: 0.4.0` in the `.toc`.
- [ ] **Step 3: Run every check.** Commit as `chore: version 0.4.0`.

**After the final review and its fixes:**
1. Build the program in the background: `cd app && npm run dist`. Expected: `app/release/Wowhead Gatherer 0.4.0.exe`.
2. Merge into `main` and push:
   - `git checkout main && git merge --ff-only feat/pin-and-chains`;
   - `git push origin main feat/pin-and-chains`.
   - **If the fast-forward fails** (main has moved): stop and report.
   - **If the push fails** for authentication: report it. Never force.
3. Switch back with `git checkout feat/pin-and-chains`, so the working tree stays on the branch.

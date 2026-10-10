# Quests and a WoW Look Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hover a quest (quest log, chat link, Blizzard's tracker, in TBC and WoW Forever), press Ctrl+C once, and the app's popup shows the quest's chain and best comments. Every popup now looks like Blizzard's modern panels.

**Architecture:**
- **The add-on** gains `Quests.lua`. It knows which quest is under the cursor:
  - Blizzard's `EventRegistry` announces quest log and Forever tracker hovers.
  - A post-hook on `QuestWatch_Update` maps TBC's tracker lines.
  - A hook on `ItemRefTooltip:SetHyperlink` remembers chat quest links.
- **`ns.GetHovered()`** returns `kind, id, label` for items and quests alike, and the readied copy and the fallback link box use it.
- **The app:**
  - `WowheadLink` gains `kind`.
  - A new quest page reader feeds a `QuestInfo`.
  - The popup renders a "Quest chain" section.
  - `popup.css` is rewritten in the WoW panel style, with a bundled free font.

**Tech Stack:** Lua 5.1 (WoW 2.5.6 and Forever add-on API), pytest + lupa. Electron 44, TypeScript 7, esbuild, Vitest 5, happy-dom.

**Spec:** `docs/superpowers/specs/2026-10-10-quests-and-wow-look-design.md`. It builds on `docs/superpowers/specs/2026-10-09-wowhead-gatherer-design.md`. Read both first.

## Global Constraints

- **The key stays one Ctrl+C.** The app never sends input to the game, never reads its memory and never reads the screen. The add-on never touches the clipboard.
- **The link is the contract:** `https://www.wowhead.com/[site/][lang/]<kind>=<id>`, where `<kind>` is `item` or `quest` and the language comes after the site (`/tbc/de/quest=10482`). Language codes: `de es mx fr it pt ru ko cn tw`; English has none.
- **The add-on's `.toc`:** `## Interface: 20506, 16001`. 20506 is TBC Anniversary. 16001 is a guess at WoW Forever's number, to be checked at launch.
- **Every TBC-only global** (`GetQuestLogTitle`, `FauxScrollFrame_GetOffset`, `QuestLogListScrollFrame`, `QuestWatch_Update`, `QuestWatchFrame`, `QuestWatchLineN`) is used only behind an existence check or on a path only TBC triggers. Forever must log in without a Lua error.
- **The spec's Forever API check was done while planning** (2026-10-10, `forever` branch, build 1.60.1.70338). Every global and template the add-on already used is in Forever's UI source, among them `GetCurrentBindingSet`, `GetCurrentKeyBoardFocus`, `Settings.*`, `TooltipDataProcessor`, `InputBoxTemplate`, `TooltipBackdropTemplate` and `C_QuestLog.GetTitleForQuestID`. No fallbacks are needed beyond the TBC-only quest globals above.
- **One deliberate deviation from the spec:** the quest on show in a chain is gold but not bold. Marcellus has a single weight, and the browser's faked bold smears it.
- **Quest hover announcements** (verified in Blizzard's code), each called as `func(owner, ...)` when registered with an owner:
  - TBC: `"QuestLogFrame.MouseOver"` `(button, logIndex)`.
  - Forever: `"QuestMapLogTitleButton.OnEnter"` `(button, questID)` and `"OnQuestBlockHeader.OnEnter"` `(block, questID, isGroup)`.
- **Wowhead politeness:** one page request per lookup, never in the background, and pages cached 24 h. Tests never fetch Wowhead; they use `app/test/fixtures`.
- **Popup security:**
  - Wowhead text goes in only through `textContent`, or `append` of a string.
  - The page's CSP is exactly `default-src 'none'; script-src 'self'; style-src 'self'; img-src https://wow.zamimg.com; font-src 'self'`.
- **The look:**
  - No Blizzard artwork is copied into the app.
  - The font is Marcellus (SIL Open Font License), bundled with its licence in `app/static/fonts/`.
- **Style:** `UPPER_CASE` constants with their units in a comment, comments that say *why*, plain-English text for players.
- **Commands:**
  - Lua tests run from the repo root: `.venv/Scripts/python -m pytest tests -q`.
  - App commands run from `app/`: `npm test`, `npm run typecheck`, `npm run build`.
  - If Git Bash can't find `npm`, prefix with `export PATH="/c/Program Files/nodejs:$PATH" &&`.
  - Electron needs `env -u ELECTRON_RUN_AS_NODE` in this shell.
- **Commits:** Conventional Commits, each ending with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (pass it as a second `-m`).
- **Paths:**
  - The repo is `D:\Development\WoW Addons\WowheadGatherer` (Git Bash: `/d/Development/WoW Addons/WowheadGatherer`), branch `feat/wowhead-gatherer`.
  - The scratchpad is `C:\Users\kresi\AppData\Local\Temp\claude\d--Development-WoW-Addons\2eadad6d-accf-42c0-8661-625beb7a9ccc\scratchpad` (called `$SCRATCH` below).

## Review Focus

These are the inputs the spec implies but its happy paths don't exercise. Each one has a test in the task named.

1. **Forever logging in**, where TBC's quest log and tracker functions don't exist → the add-on loads with no Lua error. *Task 2 (`test_forever_logs_in_without_tbc_quest_functions`).*
2. **The quest log scrolled with the mouse wheel** under a still cursor → the lookup takes the quest now under the cursor, not the one first entered. *Task 2 (`test_follows_a_wheel_scroll`).*
3. **A zone header hovered in the quest log** → not a quest: nothing is readied, and the fallback says to hover an item or quest. *Task 2 (`test_zone_header_is_not_a_quest`).*
4. **A stale chat quest link:** its tooltip is still open but not hovered, or it now shows an item → not a quest. *Task 2 (`test_chat_link_not_hovered`, `test_chat_link_replaced_by_an_item`).*
5. **A quest and an item with the same ID** → they never share a cached popup. *Task 7 (`keeps a quest and an item with the same number apart`).*

## File Structure

```
WowheadGatherer/
  WowheadGatherer.toc   Interface 20506, 16001; Quests.lua added; Notes say "item or quest"
  Url.lua               ns.BuildURL(kind, id, projectID, locale), ns.ParseQuestLink (Task 1)
  Quests.lua            NEW: ns.GetHoveredQuest(), ns.QuestTitle(), ns:InitializeQuests() (Task 2)
  Lookup.lua            + ns.GetHovered() → kind, id, label (Task 2)
  ReadyCopy.lua         readies quests; lets a quest go when the cursor leaves it (Task 3)
  Core.lua Popup.lua Keybinding.lua Options.lua   quests in the fallback box and the texts (Tasks 2, 4)
  tests/conftest.py     quest stubs (Task 2), textures that keep their texture (Task 4)
  tests/test_quests.py  NEW (Task 2)
  app/src/shared/wowheadLink.ts types.ts            kind + id; PageHeader, QuestInfo (Task 5)
  app/src/main/questPage.ts questInfo.ts            NEW: read a quest page (Task 6)
  app/src/main/wowheadClient.ts                     quests, cache v2 (Tasks 5, 7)
  app/src/renderer/popup.ts                         the quest chain (Task 8)
  app/static/popup.css popup.html fonts/            the WoW look (Task 9)
  app/src/main/popupWindow.ts                       see-through window for rounded corners (Task 9)
  CLAUDE.md, ../CLAUDE.md                           notes (Task 10)
```

---

### Task 1: Item and quest addresses

**Files:**
- Modify: `Url.lua`
- Test: `tests/test_url.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ns.BuildURL(kind, id, projectID, locale) → string`, where `kind` is `"item"` or `"quest"`.
  - `ns.BuildItemURL(itemID, projectID, locale)`, unchanged, now a wrapper.
  - `ns.ParseQuestLink(link) → questID, name | nil`. It reads `"|Hquest:10482:58|h[Name]|h"` or a bare `"quest:10482:58"`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_url.py`:

```python
FEL_ORC = "|cffffff00|Hquest:10482:58|h[Fel Orc Scavengers]|h|r"


def test_quest_address(ns):
    assert ns.BuildURL("quest", 10482, TBC, "enUS") == "https://www.wowhead.com/tbc/quest=10482"


def test_quest_address_in_german_on_forever(ns):
    assert ns.BuildURL("quest", 10482, FOREVER, "deDE") == "https://www.wowhead.com/forever/de/quest=10482"


def test_item_address_through_build_url(ns):
    assert ns.BuildURL("item", 19019, TBC, "enUS") == ns.BuildItemURL(19019, TBC, "enUS")


def test_parse_quest_link(ns):
    assert ns.ParseQuestLink(FEL_ORC) == (10482, "Fel Orc Scavengers")


def test_parse_bare_quest_string(ns):
    # ItemRefTooltip:SetHyperlink gets the link without its |H…|h wrapping.
    assert ns.ParseQuestLink("quest:10482:58") == (10482, None)


def test_parse_quest_ignores_item_links(ns):
    assert ns.ParseQuestLink(THUNDERFURY) is None


def test_parse_quest_ignores_nil(ns):
    assert ns.ParseQuestLink(None) is None
```

- [ ] **Step 2: Run them to see them fail**

Run: `.venv/Scripts/python -m pytest tests/test_url.py -q`
Expected: 7 failed with `attempt to call field 'BuildURL' (a nil value)` or `'ParseQuestLink' (a nil value)`. All the old URL tests pass.

- [ ] **Step 3: Implement**

In `Url.lua`, replace the whole `ns.BuildItemURL` function (its comment included) with:

```lua
-- Builds the Wowhead address of an item or a quest (kind "item" or "quest"),
-- e.g. https://www.wowhead.com/tbc/de/quest=10482. Wowhead redirects it to the
-- page with the name in the address.
function ns.BuildURL(kind, id, projectID, locale)
    local url = ns.WOWHEAD_ROOT
    local site = SITE_PATHS[projectID]
    if site and site ~= "" then
        url = url .. site .. "/"
    end
    local language = LANGUAGE_PATHS[locale]
    if language then
        url = url .. language .. "/"
    end
    return url .. kind .. "=" .. id
end

-- An item's Wowhead address, e.g. https://www.wowhead.com/tbc/de/item=19019.
function ns.BuildItemURL(itemID, projectID, locale)
    return ns.BuildURL("item", itemID, projectID, locale)
end
```

Append to `Url.lua`:

```lua
-- Returns the quest ID and name in a quest link ("|Hquest:10482:58|h[Name]|h"),
-- or just the ID from a bare "quest:10482:58" string, which is what
-- ItemRefTooltip:SetHyperlink gets. Nil when there's no quest ID.
function ns.ParseQuestLink(link)
    if type(link) ~= "string" then
        return nil
    end
    local questID = tonumber(link:match("^quest:(%d+)") or link:match("|Hquest:(%d+)"))
    if not questID then
        return nil
    end
    return questID, link:match("|h%[(.-)%]|h")
end
```

- [ ] **Step 4: Run the whole add-on suite**

Run: `.venv/Scripts/python -m pytest tests -q`
Expected: `116 passed`.

- [ ] **Step 5: Commit**

```bash
git add Url.lua tests/test_url.py
git commit -m "feat(addon): Wowhead addresses and links for quests" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Quests under the cursor

**Files:**
- Create: `Quests.lua`, `tests/test_quests.py`
- Modify:
  - `Lookup.lua`: append `ns.GetHovered`.
  - `Core.lua`: `PLAYER_LOGIN` calls `self:InitializeQuests()`.
  - `WowheadGatherer.toc`: lists `Quests.lua`.
  - `tests/conftest.py`: quest stubs.

**Interfaces:**
- Consumes: `ns.ParseQuestLink` (Task 1) and `ns.GetHoveredItem()` (existing).
- Produces:
  - `ns.GetHoveredQuest() → questID, title | nil`. The title can be nil.
  - `ns.QuestTitle(questID) → string | nil`.
  - `ns:InitializeQuests()`, run at `PLAYER_LOGIN` before `InitializeReadyCopy`.
  - `ns.GetHovered() → kind, id, label | nil`. `kind` is `"item"` (label = item link or nil) or `"quest"` (label = quest name or nil). Items come first.
  - **Hover callback:** a hover announcement calls `ns:OnQuestEntered()` when it exists. Task 3 defines it.
  - **Test stubs** (`conftest.py`):
    - `hooksecurefunc`, `EventRegistry` (`RegisterCallback`/`TriggerEvent`), `FakeHoverable(o)` (fields `shown`, `mouseOver`, `row` = `GetID()`);
    - `questLog`, `questLogOffset`, `GetQuestLogTitle`, `FauxScrollFrame_GetOffset`, `QuestLogListScrollFrame`;
    - `questWatches`, `GetNumQuestWatches`, `GetQuestIndexForWatch`, `GetNumQuestLeaderBoards`, `QuestWatch_Update`, `QuestWatchFrame`, `QuestWatchLine1..30`;
    - `questTitles`, `C_QuestLog.GetQuestInfo`;
    - a default hidden `ItemRefTooltip`;
    - `FakeTooltip:SetHyperlink`.

- [ ] **Step 1: Add the quest stubs to the test harness**

In `tests/conftest.py`, inside `FakeTooltip`, just before `return tooltip`, add:

```lua
    function tooltip:SetHyperlink(link) self.hyperlink = link end
```

At the end of `WOW_STUBS` (after the line `GameTooltip = FakeTooltip({ shown = false })`), add:

```lua

-- hooksecurefunc([table,] name, hook): the hook runs after the original, with its arguments.
function hooksecurefunc(target, name, hook)
    if type(target) == "string" then
        target, name, hook = _G, target, name
    end
    local original = target[name]
    target[name] = function(...)
        local results = { original(...) }
        hook(...)
        return unpack(results)
    end
end

-- EventRegistry calls a callback registered with an owner as func(owner, ...)
-- (Blizzard_SharedXMLBase/CallbackRegistry.lua).
EventRegistry = { callbacks = {} }
function EventRegistry:RegisterCallback(event, func, owner)
    self.callbacks[event] = self.callbacks[event] or {}
    table.insert(self.callbacks[event], { func = func, owner = owner })
end
function EventRegistry:TriggerEvent(event, ...)
    for _, callback in ipairs(self.callbacks[event] or {}) do
        callback.func(callback.owner, ...)
    end
end

-- A button, block or text line the cursor can be over. Fields: shown (default
-- true), mouseOver, row (what GetID returns), and any others the code reads.
function FakeHoverable(o)
    function o:IsShown() return self.shown ~= false end
    function o:IsVisible() return self.shown ~= false end
    function o:IsMouseOver() return self.mouseOver == true end
    function o:GetID() return self.row end
    return o
end

-- TBC's quest log: questLog[index] = { title, questID, isHeader, objectives },
-- scrolled down questLogOffset rows. GetQuestLogTitle returns what TBC's
-- QuestLogFrame.lua reads: title, level, tag, isHeader, collapsed, complete, frequency, questID.
questLog = {}
questLogOffset = 0
QuestLogListScrollFrame = {}
function FauxScrollFrame_GetOffset() return questLogOffset end
function GetQuestLogTitle(index)
    local quest = questLog[index]
    if not quest then return nil end
    return quest.title, 70, nil, quest.isHeader == true, false, nil, 0, quest.questID
end
-- TBC's tracker: the quest log indexes watched, in order, and its 30 lines.
questWatches = {}
function GetNumQuestWatches() return #questWatches end
function GetQuestIndexForWatch(i) return questWatches[i] end
function GetNumQuestLeaderBoards(index) return questLog[index] and questLog[index].objectives or 0 end
function QuestWatch_Update() end
QuestWatchFrame = FakeHoverable({})
for i = 1, 30 do
    _G["QuestWatchLine" .. i] = FakeHoverable({ shown = false })
end
-- Quest names the client knows, by ID. TBC names them with C_QuestLog.GetQuestInfo.
questTitles = {}
C_QuestLog = { GetQuestInfo = function(questID) return questTitles[questID] end }
-- A closed chat-link tooltip, so code that hooks it at login always finds one.
ItemRefTooltip = FakeTooltip({ shown = false })
```

- [ ] **Step 2: Write the failing tests**

Create `tests/test_quests.py`:

```python
import pytest

THUNDERFURY = "|cffff8000|Hitem:19019::::::::70:::::|h[Thunderfury, Blessed Blade of the Windseeker]|h|r"
FEL_ORC = (10482, "Fel Orc Scavengers")
KNOW_YOUR_ENEMY = (10160, "Know your Enemy")


def log_in(addon):
    addon.load_all()
    addon.fire("ADDON_LOADED", "WowheadGatherer")
    addon.fire("PLAYER_LOGIN")


@pytest.fixture
def tbc(addon):
    """TBC, logged in, with a zone header and two quests in the quest log."""
    addon.run("""
        questLog = {
            { title = "Hellfire Peninsula", isHeader = true },
            { title = "Fel Orc Scavengers", questID = 10482, objectives = 1 },
            { title = "Know your Enemy", questID = 10160, objectives = 2 },
        }
    """)
    log_in(addon)
    return addon


def hovered(addon):
    return addon.run("return ns.GetHoveredQuest()")


def enter_log_title(addon, row):
    """Hovers the quest log title on `row`, announced the way TBC's QuestLogFrame.lua does."""
    return addon.run(f"""
        local button = FakeHoverable({{ row = {row}, mouseOver = true }})
        EventRegistry:TriggerEvent("QuestLogFrame.MouseOver", button, {row} + questLogOffset)
        return button
    """)


def test_quest_log_title(tbc):
    enter_log_title(tbc, 2)
    assert hovered(tbc) == FEL_ORC


def test_zone_header_is_not_a_quest(tbc):
    enter_log_title(tbc, 1)
    assert hovered(tbc) is None


def test_leaving_the_title(tbc):
    button = enter_log_title(tbc, 2)
    button.mouseOver = False
    assert hovered(tbc) is None


def test_closing_the_quest_log(tbc):
    button = enter_log_title(tbc, 2)
    button.shown = False
    assert hovered(tbc) is None


def test_follows_a_wheel_scroll(tbc):
    # The wheel scrolls the list under a still cursor: the same title button now shows the next quest.
    enter_log_title(tbc, 2)
    tbc.g.questLogOffset = 1
    assert hovered(tbc) == KNOW_YOUR_ENEMY


def watch_both_quests(addon):
    # Lines: 1 Fel Orc Scavengers, 2 its objective, 3 Know your Enemy, 4 and 5 its objectives.
    addon.run("questWatches = { 2, 3 }; QuestWatch_Update()")


def hover_line(addon, line):
    addon.run(f"QuestWatchLine{line}.shown = true; QuestWatchLine{line}.mouseOver = true")


@pytest.mark.parametrize("line, quest", [(1, FEL_ORC), (2, FEL_ORC), (3, KNOW_YOUR_ENEMY), (5, KNOW_YOUR_ENEMY)])
def test_tracker_lines(tbc, line, quest):
    watch_both_quests(tbc)
    hover_line(tbc, line)
    assert hovered(tbc) == quest


def test_tracker_line_past_the_last_quest(tbc):
    watch_both_quests(tbc)
    hover_line(tbc, 6)
    assert hovered(tbc) is None


def test_hidden_tracker(tbc):
    # Questie's tracker hides Blizzard's.
    watch_both_quests(tbc)
    hover_line(tbc, 1)
    tbc.g.QuestWatchFrame.shown = False
    assert hovered(tbc) is None


def test_tracker_skips_quests_without_objectives(tbc):
    # QuestWatch_Update gives a quest with no objectives no lines at all.
    tbc.run("questLog[2].objectives = 0")
    watch_both_quests(tbc)
    hover_line(tbc, 1)
    assert hovered(tbc) == KNOW_YOUR_ENEMY


@pytest.fixture
def chat_link(addon):
    """A clicked chat link for Fel Orc Scavengers, its tooltip under the cursor."""
    addon.g.ItemRefTooltip = addon.tooltip(mouseOver=True)
    addon.g.questTitles[10482] = "Fel Orc Scavengers"
    log_in(addon)
    addon.run('ItemRefTooltip:SetHyperlink("quest:10482:58")')
    return addon


def test_chat_quest_link(chat_link):
    assert hovered(chat_link) == FEL_ORC


def test_chat_link_not_hovered(addon):
    addon.g.ItemRefTooltip = addon.tooltip(mouseOver=False)
    log_in(addon)
    addon.run('ItemRefTooltip:SetHyperlink("quest:10482:58")')
    assert hovered(addon) is None


def test_chat_link_replaced_by_an_item(chat_link):
    chat_link.run('ItemRefTooltip:SetHyperlink("item:19019")')
    assert hovered(chat_link) is None


@pytest.fixture
def forever(addon):
    """WoW Forever: the mainline quest functions, and none of TBC's quest log or tracker."""
    addon.run("""
        WOW_PROJECT_ID = 18
        GetQuestLogTitle, FauxScrollFrame_GetOffset, QuestLogListScrollFrame = nil, nil, nil
        QuestWatch_Update, QuestWatchFrame = nil, nil
        for i = 1, 30 do _G["QuestWatchLine" .. i] = nil end
        questTitles[10482] = "Fel Orc Scavengers"
        C_QuestLog = { GetTitleForQuestID = function(questID) return questTitles[questID] end }
    """)
    log_in(addon)
    return addon


def test_forever_logs_in_without_tbc_quest_functions(forever):
    assert hovered(forever) is None


def test_forever_quest_list_title(forever):
    forever.run("""
        local button = FakeHoverable({ mouseOver = true, questID = 10482 })
        EventRegistry:TriggerEvent("QuestMapLogTitleButton.OnEnter", button, 10482)
    """)
    assert hovered(forever) == FEL_ORC


def test_forever_tracker_quest(forever):
    forever.run("""
        local block = FakeHoverable({ mouseOver = true, id = 10482 })
        EventRegistry:TriggerEvent("OnQuestBlockHeader.OnEnter", block, 10482, false)
    """)
    assert hovered(forever) == FEL_ORC


def test_forever_leaving_the_tracker(forever):
    forever.run("""
        local block = FakeHoverable({ mouseOver = true, id = 10482 })
        EventRegistry:TriggerEvent("OnQuestBlockHeader.OnEnter", block, 10482, false)
        block.mouseOver = false
    """)
    assert hovered(forever) is None


def test_items_come_before_quests(tbc):
    tbc.g.GameTooltip = tbc.tooltip(legacyLink=THUNDERFURY)
    enter_log_title(tbc, 2)
    assert tbc.run("return ns.GetHovered()") == ("item", 19019, THUNDERFURY)


def test_a_quest_when_no_item_is_hovered(tbc):
    enter_log_title(tbc, 2)
    assert tbc.run("return ns.GetHovered()") == ("quest", 10482, "Fel Orc Scavengers")


def test_nothing_hovered(tbc):
    assert tbc.run("return ns.GetHovered()") is None


def test_entering_a_quest_tells_the_ready_copy(tbc):
    tbc.run("entered = 0; function ns:OnQuestEntered() entered = entered + 1 end")
    enter_log_title(tbc, 2)
    assert tbc.g.entered == 1
```

- [ ] **Step 3: Run them to see them fail**

Run: `.venv/Scripts/python -m pytest tests/test_quests.py -q`
Expected: 23 tests fail or error with `attempt to call field 'GetHoveredQuest' (a nil value)`, `'GetHovered' (a nil value)` or a failed assert on `entered`.

- [ ] **Step 4: Create `Quests.lua`**

```lua
local _, ns = ...

-- Quests under the cursor. Blizzard announces hovers over quest log titles (TBC
-- and Forever) and over Forever's tracker through EventRegistry, so those are
-- listened for. TBC's tracker lines don't take the mouse, so they're checked
-- where they are. A clicked chat quest link is remembered as ItemRefTooltip
-- shows it.

-- The hover announcements: TBC's quest log (Blizzard_UIPanels_Game/TBC/QuestLogFrame.lua),
-- and Forever's quest list and tracker (Mainline/QuestMapFrame.lua,
-- Blizzard_ObjectiveTracker/Blizzard_QuestObjectiveTracker.lua).
local QUEST_LOG_HOVER = "QuestLogFrame.MouseOver"         -- (button, logIndex)
local QUEST_MAP_HOVER = "QuestMapLogTitleButton.OnEnter"  -- (button, questID)
local TRACKER_HOVER = "OnQuestBlockHeader.OnEnter"        -- (block, questID, isGroup)
-- How many lines TBC's tracker has (MAX_QUESTWATCH_LINES in QuestLogFrame.lua).
local WATCH_LINES = 30

-- The last quest log title, Forever quest list title and Forever tracker block entered.
local logButton, mapButton, trackerBlock
-- The quest a clicked chat link showed in ItemRefTooltip, or nil.
local chatLinkQuest
-- TBC tracker line number -> { questID, title }, rebuilt after each tracker update.
local watchLineQuests = {}

local function IsHovered(region)
    return region ~= nil and region:IsVisible() and region:IsMouseOver()
end

-- A quest's name, where the client knows it: C_QuestLog.GetTitleForQuestID on
-- mainline-family clients (Forever), C_QuestLog.GetQuestInfo on TBC.
function ns.QuestTitle(questID)
    local questLog = C_QuestLog
    if not questLog then
        return nil
    end
    local getTitle = questLog.GetTitleForQuestID or questLog.GetQuestInfo
    return getTitle and getTitle(questID) or nil
end

-- The quest on a TBC quest log title. It's read now, not when the title was
-- entered, so a wheel scroll since then is followed. Headers (zones) have none.
local function LogButtonQuest(button)
    local index = button:GetID() + FauxScrollFrame_GetOffset(QuestLogListScrollFrame)
    local title, _, _, isHeader, _, _, _, questID = GetQuestLogTitle(index)
    if questID and questID > 0 and not isHeader then
        return questID, title
    end
end

-- Maps TBC's tracker lines to quests the way QuestWatch_Update fills them: for
-- each watched quest with objectives, its title, then one line per objective.
local function MapWatchLines()
    watchLineQuests = {}
    local line = 1
    for i = 1, GetNumQuestWatches() do
        local index = GetQuestIndexForWatch(i)
        local objectives = index and GetNumQuestLeaderBoards(index) or 0
        if objectives > 0 then
            local title, _, _, _, _, _, _, questID = GetQuestLogTitle(index)
            for l = line, math.min(line + objectives, WATCH_LINES) do
                watchLineQuests[l] = { questID = questID, title = title }
            end
            line = line + objectives + 1
        end
    end
end

local function TrackerLineQuest()
    if not (QuestWatchFrame and QuestWatchFrame:IsVisible()) then
        return nil
    end
    for l, quest in pairs(watchLineQuests) do
        if quest.questID and IsHovered(_G["QuestWatchLine" .. l]) then
            return quest.questID, quest.title
        end
    end
end

-- Returns the ID and, when known, the name of the quest under the cursor, or nil.
function ns.GetHoveredQuest()
    if chatLinkQuest and ItemRefTooltip:IsShown() and ItemRefTooltip:IsMouseOver() then
        return chatLinkQuest, ns.QuestTitle(chatLinkQuest)
    end
    if IsHovered(logButton) then
        local questID, title = LogButtonQuest(logButton)
        if questID then
            return questID, title
        end
    end
    if IsHovered(mapButton) and mapButton.questID then
        return mapButton.questID, ns.QuestTitle(mapButton.questID)
    end
    if IsHovered(trackerBlock) and trackerBlock.id then
        return trackerBlock.id, ns.QuestTitle(trackerBlock.id)
    end
    return TrackerLineQuest()
end

local function Entered()
    -- ReadyCopy.lua readies a quest entered while Ctrl is held.
    if ns.OnQuestEntered then
        ns:OnQuestEntered()
    end
end

-- Listens for the hovers and chat links. Run at PLAYER_LOGIN, once Blizzard's
-- frames exist. Each piece is set up only on the clients that have it.
function ns:InitializeQuests()
    if EventRegistry then
        EventRegistry:RegisterCallback(QUEST_LOG_HOVER, function(_, button)
            logButton = button
            Entered()
        end, ns)
        EventRegistry:RegisterCallback(QUEST_MAP_HOVER, function(_, button)
            mapButton = button
            Entered()
        end, ns)
        EventRegistry:RegisterCallback(TRACKER_HOVER, function(_, block)
            trackerBlock = block
            Entered()
        end, ns)
    end
    if QuestWatch_Update then
        hooksecurefunc("QuestWatch_Update", MapWatchLines)
        MapWatchLines()
    end
    if ItemRefTooltip and ItemRefTooltip.SetHyperlink then
        hooksecurefunc(ItemRefTooltip, "SetHyperlink", function(_, link)
            chatLinkQuest = ns.ParseQuestLink(link)
        end)
    end
end
```

- [ ] **Step 5: Add `ns.GetHovered`, run the quest setup at login, and list the file**

Append to `Lookup.lua`:

```lua

-- Returns what's under the cursor: "item" or "quest", its ID, and the item's
-- link or the quest's name (either can be nil). Nil when it's neither. Items
-- come first, so a quest log open behind a bag doesn't take over.
function ns.GetHovered()
    local itemID, link = ns.GetHoveredItem()
    if itemID then
        return "item", itemID, link
    end
    local questID, title = ns.GetHoveredQuest()
    if questID then
        return "quest", questID, title
    end
end
```

In `Core.lua`'s `ns:PLAYER_LOGIN`, replace:

```lua
    self:InitializeOptions()
    self:InitializeReadyCopy()
```

with:

```lua
    self:InitializeOptions()
    self:InitializeQuests()
    self:InitializeReadyCopy()
```

In `WowheadGatherer.toc`, add the line `Quests.lua` straight after `Lookup.lua`.

- [ ] **Step 6: Run the whole add-on suite**

Run: `.venv/Scripts/python -m pytest tests -q`
Expected: `139 passed`.

- [ ] **Step 7: Commit**

```bash
git add Quests.lua Lookup.lua Core.lua WowheadGatherer.toc tests/conftest.py tests/test_quests.py
git commit -m "feat(addon): know the quest under the cursor (quest log, tracker, chat links)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: One-press copy for quests

**Files:**
- Modify: `ReadyCopy.lua`
- Test: `tests/test_ready_copy.py`

**Interfaces:**
- Consumes: `ns.GetHovered()`, `ns.GetHoveredQuest()` and the `ns:OnQuestEntered()` callback (Task 2), plus `ns.BuildURL` (Task 1).
- Produces: `ns:OnQuestEntered()`. `ns:ReadyCopy()`, `ns:UnreadyCopy()` and `ns:GetReadyURL()` keep their names. The ready box gets an `OnUpdate` script.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_ready_copy.py`:

```python
FEL_ORC_URL = "https://www.wowhead.com/tbc/quest=10482"


def hover_quest_title(addon, owner=None):
    """Moves from the bag item to a TBC quest log title (Fel Orc Scavengers), announced
    as Blizzard does. The game tooltip is closed; `owner` is its last owner."""
    addon.g.GameTooltip = addon.tooltip(shown=False, owner=owner)
    return addon.run("""
        questLog = { { title = "Fel Orc Scavengers", questID = 10482, objectives = 1 } }
        local button = FakeHoverable({ row = 1, mouseOver = true })
        EventRegistry:TriggerEvent("QuestLogFrame.MouseOver", button, 1)
        return button
    """)


def frame(addon):
    """One frame of the game: the ready box's OnUpdate."""
    box = ready_box(addon)
    box.scripts.OnUpdate(box, 0.016)


def test_holding_ctrl_over_a_quest_readies_its_link(addon):
    hover_quest_title(addon)
    hold_ctrl(addon)
    assert ready_url(addon) == FEL_ORC_URL


def test_entering_a_quest_while_holding_ctrl(addon):
    hold_ctrl(addon)
    hover_quest_title(addon)
    assert ready_url(addon) == FEL_ORC_URL


def test_leaving_the_quest_lets_go(addon):
    # A quest has no tooltip that closes when the cursor leaves it.
    button = hover_quest_title(addon)
    hold_ctrl(addon)
    assert ready_url(addon) == FEL_ORC_URL
    button.mouseOver = False
    frame(addon)
    assert ready_url(addon) is None
    assert addon.g.keyboardFocus is None


def test_staying_on_the_quest_keeps_it_ready(addon):
    hover_quest_title(addon)
    hold_ctrl(addon)
    frame(addon)
    assert ready_url(addon) == FEL_ORC_URL


def test_a_closed_tooltip_last_owned_by_an_action_button_does_not_matter(addon):
    hover_quest_title(addon, owner=addon.lua.table_from({"action": 5}))
    hold_ctrl(addon)
    assert ready_url(addon) == FEL_ORC_URL


def test_the_quest_check_leaves_items_alone(addon):
    hold_ctrl(addon)
    frame(addon)
    assert ready_url(addon) == URL


def test_ctrl_c_copies_a_quest(addon):
    hover_quest_title(addon)
    hold_ctrl(addon)
    key(addon, "OnKeyDown", "C")
    key(addon, "OnKeyUp", "C")
    assert addon.values("flashes") == ["Wowhead link copied."]
```

- [ ] **Step 2: Run them to see them fail**

Run: `.venv/Scripts/python -m pytest tests/test_ready_copy.py -q`
Expected:
- The 7 new tests fail. The ready URL is None or still the item's, or there's `attempt to call ... OnUpdate` / `'NoneType' object has no attribute 'scripts'`.
- The 24 old tests pass.

- [ ] **Step 3: Implement**

In `ReadyCopy.lua`:

1. In the opening comment, change "While Ctrl is held over an item, a hidden edit box holds the item's Wowhead link" to "While Ctrl is held over an item or quest, a hidden edit box holds its Wowhead link". Change "a Ctrl+key binding pressed over an item would be used up" to "a Ctrl+key binding pressed over an item or quest would be used up".

2. After `local readyURL`, add:

```lua
-- What the box holds: "item" or "quest", and its ID.
local readyKind, readyID
```

3. In `CreateReadyBox`, replace the `OnEditFocusLost` script with these two scripts:

```lua
    editBox:SetScript("OnEditFocusLost", function()
        readyURL, readyKind, readyID = nil, nil, nil
        watcher.Reset()
    end)
    -- A quest has no tooltip that closes when the cursor leaves it, so check
    -- each frame that it's still under the cursor.
    editBox:SetScript("OnUpdate", function()
        if readyKind == "quest" and ns.GetHoveredQuest() ~= readyID then
            ns:UnreadyCopy()
        end
    end)
```

4. In `ns:CanReadyCopy`, replace the last line, `return not IsActionButton(GameTooltip:GetOwner())`, with:

```lua
    -- Ctrl+number over an action button is a key binding, not a copy. Only a
    -- shown tooltip says what's under the cursor; a closed one keeps its last owner.
    return not (GameTooltip:IsShown() and IsActionButton(GameTooltip:GetOwner()))
```

5. Replace `ns:ReadyCopy` and `ns:UnreadyCopy` with:

```lua
-- Readies the link of the item or quest under the cursor, or lets go when
-- there's nothing to ready.
function ns:ReadyCopy()
    local kind, id
    if self:CanReadyCopy() then
        kind, id = ns.GetHovered()
    end
    if not id then
        self:UnreadyCopy()
        return
    end
    box = box or CreateReadyBox()
    readyKind, readyID = kind, id
    readyURL = ns.BuildURL(kind, id, WOW_PROJECT_ID, self:GetWowheadLocale())
    box:SetText(readyURL)
    box:SetFocus()
    box:HighlightText()
end

function ns:UnreadyCopy()
    readyURL, readyKind, readyID = nil, nil, nil
    if box and box:HasFocus() then
        box:ClearFocus()
    end
end
```

6. Replace the `OnItemTooltip` function with:

```lua
-- Moving onto another item or quest while still holding Ctrl readies that one.
local function ReadyIfHeld()
    if IsReadyKeyDown() and not letGo then
        ns:ReadyCopy()
    end
end

local function OnItemTooltip(tooltip)
    if tooltip == GameTooltip then
        ReadyIfHeld()
    end
end

-- Run by Quests.lua when a quest log title or tracker quest is entered.
function ns:OnQuestEntered()
    ReadyIfHeld()
end
```

- [ ] **Step 4: Run the whole add-on suite**

Run: `.venv/Scripts/python -m pytest tests -q`
Expected: `146 passed`.

- [ ] **Step 5: Commit**

```bash
git add ReadyCopy.lua tests/test_ready_copy.py
git commit -m "feat(addon): one Ctrl+C copies a hovered quest's link" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Quests in the fallback box, the texts, and Forever's `.toc`

**Files:**
- Modify: `Core.lua`, `Popup.lua`, `Keybinding.lua`, `Options.lua`, `WowheadGatherer.toc`, `tests/conftest.py`
- Test: `tests/test_popup.py`, `tests/test_core.py`, `tests/test_keybinding.py`, `tests/test_ready_copy.py`

**Interfaces:**
- Consumes: `ns.GetHovered()` (Task 2) and `ns.BuildURL` (Task 1).
- Produces:
  - `ns:LookupHovered()`, which replaces `ns:LookupHoveredItem()`.
  - `ns:ShowCopyPopup(url, kind, id, label)`, which replaces `(url, itemID, link)`.
  - In `conftest.py`, a frame's `CreateTexture()` returns a region that keeps `texture`.

- [ ] **Step 1: Let fake textures keep their texture**

In `tests/conftest.py`, inside `CreateFrame`, after the `CreateFontString` line, add:

```lua
    rawset(frame, "CreateTexture", function()
        local texture = FakeRegion()
        rawset(texture, "SetTexture", function(self, path) rawset(self, "texture", path) end)
        return texture
    end)
```

- [ ] **Step 2: Write the failing tests and move the old ones to the new names**

In `tests/test_popup.py`:

- In the `popup` fixture, change the `ShowCopyPopup` call to `addon.run(f'ns:ShowCopyPopup("{URL}", "item", 19019, "{THUNDERFURY}")')`.
- In `test_showing_again_swaps_the_item`, change it to `addon.run(f'ns:ShowCopyPopup("{other}", "item", 6948, nil)')`.
- Replace the `lookups` fixture's `addon.run` block with:

```python
    addon.run("""
        lookups = 0
        hoveredKind, hovered = "item", 6948
        function ns.GetHovered() if hovered then return hoveredKind, hovered end end
        function ns:LookupHovered() lookups = lookups + 1 end
    """)
```

- Change the fixture's docstring to `"""The lookup key is Ctrl+C. Counts lookups; hoveredKind and hovered say what's under the cursor."""`.
- Append:

```python
FEL_ORC_URL = "https://www.wowhead.com/tbc/quest=10482"


def test_quest_shows_the_quest_icon_and_name(addon, popup):
    addon.run(f'ns:ShowCopyPopup("{FEL_ORC_URL}", "quest", 10482, "Fel Orc Scavengers")')
    assert popup.name.GetText(popup.name) == "Fel Orc Scavengers"
    assert popup.icon.texture == "Interface\\GossipFrame\\AvailableQuestIcon"
    assert popup.box.GetText(popup.box) == FEL_ORC_URL


def test_quest_without_a_known_name(addon, popup):
    addon.run(f'ns:ShowCopyPopup("{FEL_ORC_URL}", "quest", 10482, nil)')
    assert popup.name.GetText(popup.name) == "Quest 10482"


def test_lookup_key_over_a_quest_with_the_items_number_looks_it_up(lookups, popup):
    lookups.g.hoveredKind = "quest"
    lookups.g.hovered = 19019
    press(lookups, popup, "C", ctrl=True)
    release(lookups, popup, "C")
    assert lookups.g.lookups == 1
```

In `tests/test_ready_copy.py`, in `test_leaves_the_link_popup_focus_alone`, change the call to `ns:ShowCopyPopup("{HEARTHSTONE_URL}", "item", 6948, nil)`.

In `tests/test_keybinding.py`, in `test_binding_runs_the_lookup`, change `ns:LookupHoveredItem()` to `ns:LookupHovered()`.

In `tests/test_core.py`:

- In `test_nothing_hovered_says_so`, change the expected flash to `["Hover over an item or quest to look it up on Wowhead."]`.
- Append:

```python
def test_lookup_shows_a_quest_link(addon, popups):
    addon.fire("PLAYER_LOGIN")
    addon.run("""
        questLog = { { title = "Fel Orc Scavengers", questID = 10482, objectives = 1 } }
        EventRegistry:TriggerEvent("QuestLogFrame.MouseOver", FakeHoverable({ row = 1, mouseOver = true }), 1)
    """)
    addon.g.WowheadGatherer_OnBinding()
    assert popups() == ["https://www.wowhead.com/tbc/quest=10482"]


def test_toc_loads_in_tbc_and_forever():
    toc = (ADDON_DIR / "WowheadGatherer.toc").read_text(encoding="utf-8")
    # 16001 is a guess at WoW Forever's number (build 1.60.1); check it at launch.
    assert "## Interface: 20506, 16001" in toc.splitlines()
```

- [ ] **Step 3: Run them to see them fail**

Run: `.venv/Scripts/python -m pytest tests -q`
Expected:
- **Failing:**
  - every new test;
  - every test whose call or stub moved to the new names, among them:
    - `test_popup_shows_the_address` (the old `ShowCopyPopup` reads `"item"` as the item ID);
    - `test_nothing_hovered_says_so`;
    - `test_binding_runs_the_lookup`;
    - `test_lookup_key_over_another_item_looks_it_up`.
- No test fails for any other reason. None errors at import.

- [ ] **Step 4: Implement**

**`Core.lua`.** Replace `ns:LookupHoveredItem` with:

```lua
-- Run by the lookup key: shows the Wowhead link of the item or quest under the cursor.
function ns:LookupHovered()
    if not self.db.enabled then
        ns.Flash("Wowhead Gatherer is turned off. Turn it on in /whg.", 1, 0.1, 0.1)
        return
    end
    local kind, id, label = ns.GetHovered()
    if not id then
        ns.Flash("Hover over an item or quest to look it up on Wowhead.", 1, 0.1, 0.1)
        return
    end
    self:ShowCopyPopup(ns.BuildURL(kind, id, WOW_PROJECT_ID, self:GetWowheadLocale()), kind, id, label)
end
```

In `ns:TryOfferDefaultKey`, change `"Hover over any item and press "` to `"Hover over any item or quest and press "`, and change `". Pick a key for item lookups in /whg."` to `". Pick a key for lookups in /whg."`.

**`Keybinding.lua`.**
- Change `BINDING_NAME_WOWHEADGATHERER_LOOKUP = "Look up hovered item"` to `BINDING_NAME_WOWHEADGATHERER_LOOKUP = "Look up hovered item or quest"`.
- Change the body of `WowheadGatherer_OnBinding` to `ns:LookupHovered()`.

**`Popup.lua`.**

1. After `local BOX_GAP = 10`, add:

```lua
-- The icon shown for a quest: the quest giver's yellow "!".
local QUEST_ICON = "Interface\\GossipFrame\\AvailableQuestIcon"
```

2. Replace `local currentURL, currentItemID` and the comment above it with:

```lua
-- The address on show, and what it's for. Typing into the box puts the address back.
local currentURL, currentKind, currentID
```

3. In the box's `OnKeyDown` script, replace the block inside `if GetBindingFromClick(key) == ns.BINDING then … end` with:

```lua
            local kind, id = ns.GetHovered()
            if id and (kind ~= currentKind or id ~= currentID) then
                ns:LookupHovered()
                return
            end
```

   Also change that script's comment "the lookup key over another item would only copy the old address" to "the lookup key over another item or quest would only copy the old address".

4. Replace `ns:ShowCopyPopup` (and its comment) with:

```lua
-- Shows the Wowhead address of an item or quest (kind "item" or "quest"),
-- selected and ready to copy. label is the item's link or the quest's name, when
-- known. Showing it again for something else swaps the contents.
function ns:ShowCopyPopup(url, kind, id, label)
    popup = popup or CreatePopup()
    currentURL, currentKind, currentID = url, kind, id
    if kind == "quest" then
        popup.icon:SetTexture(QUEST_ICON)
        popup.name:SetText(label or ("Quest " .. id))
    else
        popup.icon:SetTexture(C_Item.GetItemIconByID(id))
        popup.name:SetText(label or C_Item.GetItemNameByID(id) or ("Item " .. id))
    end
    popup.hint:SetText(GetCopyHint())
    popup.box:SetText(url)
    popup:Show()
    watcher.Reset()
    popup.box:SetFocus()
    popup.box:HighlightText()
end
```

**`Options.lua`.**
- Replace the "Lookup" section text with: `"Hover over an item (in your bags, on your character, at a vendor, in loot or in a chat link) or a quest (in the quest log, the quest tracker or a chat link), and press the key to get its Wowhead link."`
- In the "Copy with one Ctrl+C" text, change both "over an item" to "over an item or quest".

**`WowheadGatherer.toc`.**
- Change the Interface line to `## Interface: 20506, 16001`.
- Change Notes to `## Notes: Hover over an item or quest and press Ctrl+C: the Wowhead Gatherer app shows where it comes from, its quest chain and what players say.`

- [ ] **Step 5: Run the whole add-on suite**

Run: `.venv/Scripts/python -m pytest tests -q`
Expected: `151 passed`.

- [ ] **Step 6: Commit**

```bash
git add Core.lua Popup.lua Keybinding.lua Options.lua WowheadGatherer.toc tests
git commit -m "feat(addon): quests in the link popup and texts; load in WoW Forever" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Links and shapes for quests in the app

**Files:**
- Modify:
  - `app/src/shared/wowheadLink.ts`, `app/src/shared/types.ts`
  - `app/src/main/itemInfo.ts`, `app/src/main/wowheadClient.ts`, `app/src/main/wowheadPage.ts`, `app/src/main/browserFetch.ts`
  - `app/src/renderer/popup.ts`
- Test: `app/test/wowheadLink.test.ts`, `app/test/wowheadClient.test.ts`, `app/test/wowheadPage.test.ts`, `app/test/clipboardWatcher.test.ts`, `app/test/popup.test.ts`, `app/test/itemInfo.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `type LookupKind = 'item' | 'quest'` and `WowheadLink { url, site, lang, kind: LookupKind, id: number }` (`itemId` is gone).
  - `PageHeader { kind, name, quality, icon }` replaces `ItemHeader`.
  - `ItemInfo extends PageHeader { kind: 'item'; sections; comments; commentTotal }`.
  - `ChainQuest { name; current }`, `ChainStep { position; quests: ChainQuest[] }`.
  - `QuestInfo extends PageHeader { kind: 'quest'; chain; comments; commentTotal }`. It also carries `quality: 1`, so both kinds share `PageHeader`.
  - `LookupInfo = ItemInfo | QuestInfo`. `PopupState`'s `ready` carries `info: LookupInfo` and its `error` carries `header: PageHeader | null`.
  - `isCompletePage(html)` replaces `isCompleteItemPage`.
  - `PAGE_MAX_AGE_MS` replaces `ITEM_MAX_AGE_MS`.
  - `MESSAGES.notFound(kind, id)`.
  - The test helper `setup()` in `wowheadClient.test.ts` also returns `cache`.

- [ ] **Step 1: Write the failing tests**

In `app/test/wowheadLink.test.ts`:

- Replace every `itemId: 19019` in the expected objects with `kind: 'item', id: 19019`.
- Replace `?.itemId).toBe(19019)` with `?.id).toBe(19019)`.
- Add to the `it.each` reject list: `['quest 0', 'https://www.wowhead.com/tbc/quest=0']` and `['an NPC', 'https://www.wowhead.com/tbc/npc=16820']`.
- Add:

```ts
  it('reads a TBC quest link', () => {
    expect(parseWowheadLink('https://www.wowhead.com/tbc/quest=10482')).toEqual({
      url: 'https://www.wowhead.com/tbc/quest=10482', site: 'tbc', lang: '', kind: 'quest', id: 10482,
    });
  });

  it('reads a German WoW Forever quest link', () => {
    expect(parseWowheadLink('https://www.wowhead.com/forever/de/quest=10482')).toMatchObject({
      url: 'https://www.wowhead.com/forever/de/quest=10482', site: 'forever', lang: 'de', kind: 'quest', id: 10482,
    });
  });

  it('drops the name Wowhead adds after a quest ID', () => {
    expect(parseWowheadLink('https://www.wowhead.com/tbc/quest=10482/fel-orc-scavengers')?.url)
      .toBe('https://www.wowhead.com/tbc/quest=10482');
  });
```

In `app/test/clipboardWatcher.test.ts`, replace both `link.itemId` with `link.id`.

In `app/test/wowheadPage.test.ts`, rename `isCompleteItemPage` to `isCompletePage` (the import, the `describe` and the three calls), and add inside that `describe`:

```ts
  it('accepts a whole quest page', () => {
    expect(isCompletePage(fixture('quest-10482.html.gz'))).toBe(true);
  });
```

In `app/test/itemInfo.test.ts`, in the Gorehowl test, change the `toMatchObject` to `{ kind: 'item', name: 'Gorehowl', quality: 4, icon: 'inv_axe_60', commentTotal: 90 }`.

In `app/test/popup.test.ts`:
- Add `kind: 'item',` as the first property of `info`.
- In the error test, make the header `{ kind: 'item', name: 'Gorehowl', quality: 4, icon: 'inv_axe_60' }`.

In `app/test/wowheadClient.test.ts`:

- Change the import to `import { MESSAGES, PAGE_MAX_AGE_MS, WowheadClient, withTimeout, type FetchResult } from '../src/main/wowheadClient';`, and `ITEM_MAX_AGE_MS + 1` to `PAGE_MAX_AGE_MS + 1`.
- Make `setup` return `{ client: new WowheadClient({ fetchText, loadInBrowser, cache, now }), asked, loadInBrowser, cache }`.
- Change `MESSAGES.notFound(28773)` to `MESSAGES.notFound('item', 28773)`.
- In "shows the tooltip service's name and icon…", make the header `{ kind: 'item', name: 'Gorehowl', quality: 4, icon: 'inv_axe_60' }`.
- After `const GERMAN = …`, add `const FEL_ORC = link('https://www.wowhead.com/tbc/quest=10482');`.
- Add inside `describe('WowheadClient')`:

```ts
  it('leaves items cached before quests existed alone (they have no kind)', async () => {
    const { client, asked, cache } = setup({ [GOREHOWL.url]: gorehowlPage(), [ZONES_URL]: zones() });
    cache.set('item-v1-tbc-en-28773', { name: 'Gorehowl', quality: 4, icon: 'inv_axe_60', sections: [], comments: [], commentTotal: 0 });
    const state = await client.lookup(GOREHOWL);
    expect(asked).toContain(GOREHOWL.url);
    expect(state).toMatchObject({ kind: 'ready', info: { kind: 'item' } });
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
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd app && npm test`
Expected: failures in `wowheadLink`, `wowheadClient` (the file fails at load: `link()` throws for the quest URL), `wowheadPage` (`isCompletePage` isn't exported), `itemInfo` (no `kind`) and `clipboardWatcher` (`id` is undefined).

- [ ] **Step 3: Implement**

Replace `app/src/shared/wowheadLink.ts` with:

```ts
/** What a Wowhead link points at. */
export type LookupKind = 'item' | 'quest';

/** A Wowhead address the add-on copied, e.g. https://www.wowhead.com/tbc/de/item=19019 or …/tbc/quest=10482. */
export interface WowheadLink {
  /** The address, rebuilt with nothing after the ID. */
  url: string;
  /** Wowhead's game path: "tbc", "forever", or "" for retail. */
  site: string;
  /** Wowhead's language path: "de", "fr", … or "" for English. */
  lang: string;
  kind: LookupKind;
  id: number;
}

/** The language paths Wowhead accepts after the game path (the add-on's Url.lua uses the same). */
const LANGUAGES = new Set(['de', 'es', 'mx', 'fr', 'it', 'pt', 'ru', 'ko', 'cn', 'tw']);

/** The longest clipboard text worth reading, in characters; a link is far shorter. */
const MAX_LINK_LENGTH = 300;

const LINK = /^https:\/\/www\.wowhead\.com\/(?:([a-z-]+)\/)?(?:([a-z]{2})\/)?(item|quest)=(\d+)(?:[/?#]\S*)?$/;

/** Reads a Wowhead item or quest link, or returns null for anything else. */
export function parseWowheadLink(text: string): WowheadLink | null {
  if (text.length > MAX_LINK_LENGTH) return null;
  const match = LINK.exec(text.trim());
  if (!match) return null;
  let site = match[1] ?? '';
  let lang = match[2] ?? '';
  // Retail links have only a language: /de/item=19019.
  if (!lang && LANGUAGES.has(site)) {
    lang = site;
    site = '';
  }
  if (lang && !LANGUAGES.has(lang)) return null;
  const kind = match[3] as LookupKind;
  const id = Number(match[4]);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const path = [site, lang].filter(Boolean).map((part) => `${part}/`).join('');
  return { url: `https://www.wowhead.com/${path}${kind}=${id}`, site, lang, kind, id };
}
```

In `app/src/shared/types.ts`, change the import to `import type { LookupKind, WowheadLink } from './wowheadLink';`. Then replace everything from `export interface ItemHeader` to the end of the file with:

```ts
/** What the popup's header shows. */
export interface PageHeader {
  kind: LookupKind;
  name: string;
  /** 0 poor … 5 legendary, 6 artifact, 7 heirloom, as in the game; quests are 1. */
  quality: number;
  /** The icon's file name on Wowhead's image server, e.g. "inv_axe_60" or "quest-start", or "". */
  icon: string;
}

export interface ItemInfo extends PageHeader {
  kind: 'item';
  sections: SourceSection[];
  comments: ItemComment[];
  /** Top-level comments on the page, of which `comments` are the best few. */
  commentTotal: number;
}

/** One quest of a chain step, and whether it's the quest on show. */
export interface ChainQuest {
  name: string;
  current: boolean;
}

/** One step of a quest chain: its number, and its quests (more than one where the chain branches). */
export interface ChainStep {
  position: number;
  quests: ChainQuest[];
}

export interface QuestInfo extends PageHeader {
  kind: 'quest';
  /** Wowhead's "Series" box in order, or [] when the quest isn't in a chain. */
  chain: ChainStep[];
  comments: ItemComment[];
  commentTotal: number;
}

export type LookupInfo = ItemInfo | QuestInfo;

/** What the popup shows. */
export type PopupState =
  | { kind: 'loading'; link: WowheadLink }
  | { kind: 'ready'; link: WowheadLink; info: LookupInfo }
  | { kind: 'error'; link: WowheadLink; message: string; header: PageHeader | null };
```

In `app/src/main/itemInfo.ts`, in `buildItemInfo`'s returned object, add `kind: 'item',` as the first property.

In `app/src/main/wowheadPage.ts`, rename `isCompleteItemPage` to `isCompletePage`, and change its comment to:

```ts
/**
 * Whether html is a whole Wowhead item or quest page. The page's Gatherer data comes
 * well before its Listview tables, so a page read while the browser is still parsing
 * it has the one without the other; every item and quest page has Listviews.
 */
```

In `app/src/main/browserFetch.ts`, rename the import and the call to `isCompletePage`.

In `app/src/main/wowheadClient.ts`:

- Change the imports:

```ts
import type { LookupInfo, PageHeader, PopupState } from '../shared/types';
import type { LookupKind, WowheadLink } from '../shared/wowheadLink';
```

  and `import { isCompletePage, parseItemPage } from './wowheadPage';`.
- Replace the three constants above `PAGE_HEADERS` with:

```ts
/** How long a looked-up page stays fresh, in milliseconds. */
export const PAGE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** How long the zone names stay fresh, in milliseconds. */
export const ZONES_MAX_AGE_MS = 7 * PAGE_MAX_AGE_MS;
/** Bump when what's cached changes shape, so old cache files are left alone. 2: lookups gained `kind`. */
const CACHE_VERSION = 2;
```

- In `MESSAGES`:
  - `notFound` becomes `notFound: (kind: LookupKind, id: number) => \`Wowhead doesn't know ${kind} ${id}.\``.
  - `blocked` becomes `"Wowhead didn't let the app read this page. Open it on Wowhead instead."`.
- In `lookup`:
  - The key becomes `` `item-v${CACHE_VERSION}-${link.site || 'retail'}-${link.lang || 'en'}-${link.id}` ``. The kind joins the key in Task 7.
  - The cache read becomes `this.deps.cache.get<LookupInfo>(key, PAGE_MAX_AGE_MS, this.now())`.
  - The not-found return uses `MESSAGES.notFound(link.kind, link.id)`.
  - `buildItemInfo(link.itemId, …)` becomes `buildItemInfo(link.id, …)`.
- In `fetchPage`, both `isCompleteItemPage` calls become `isCompletePage`.
- Replace `header`:

```ts
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
        quality: typeof data.quality === 'number' ? data.quality : 1,
        icon: typeof data.icon === 'string' ? data.icon : '',
      };
    } catch {
      return null;
    }
  }
```

In `app/src/renderer/popup.ts`:

- Change the type import to `import type { ItemComment, MarkupNode, PageHeader, PopupState, SourceSection } from '../shared/types';`.
- Change `headerOf`'s return type to `PageHeader | null`.
- Change `` `Item ${state.link.itemId}` `` to `` `Item ${state.link.id}` ``.
- In `renderState`, replace everything after the error branch with:

```ts
  const { info } = state;
  const sections = info.kind === 'item' ? info.sections : [];
  root.append(...sections.map(renderSection));
  if (info.comments.length > 0) {
    const block = el('section', 'comments');
    block.append(el('h2', undefined, `Comments (${info.commentTotal})`), ...info.comments.map(renderComment));
    root.append(block);
  }
  if (sections.length === 0 && info.comments.length === 0) {
    root.append(el('p', 'status', 'Wowhead lists no sources or comments for this item.'));
  }
```

- [ ] **Step 4: Run the tests and the type check**

Run: `cd app && npm test && npm run typecheck`
Expected: `Tests 157 passed (157)`, and `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add app/src app/test
git commit -m "refactor(app): links carry their kind; shapes for quests; cache v2" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Reading a quest page

**Files:**
- Create: `app/src/main/questPage.ts`, `app/src/main/questInfo.ts`, `app/test/questPage.test.ts`, `app/test/questInfo.test.ts`
- Modify: `app/src/main/markup.ts` (export `decodeEntities`)

**Interfaces:**
- Consumes: `parseItemPage`/`ItemPage` (wowheadPage.ts), `pickComments` (comments.ts), `pageNames` (itemInfo.ts), `ZoneNames` (zones.ts), and `ChainStep`, `ChainQuest`, `QuestInfo` (Task 5).
- Produces:
  - `parseQuestPage(html) → QuestPage { name: string | null; chain: ChainStep[]; data: ItemPage }`.
  - `buildQuestInfo(questId, page: QuestPage, zones: ZoneNames) → QuestInfo | null`.
  - `decodeEntities(text)` exported from markup.ts.

- [ ] **Step 1: Write the failing tests**

Create `app/test/questPage.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseQuestPage } from '../src/main/questPage';
import { fixture } from './fixtures';

describe('parseQuestPage', () => {
  it('reads the name and the chain, marking the quest on show (Fel Orc Scavengers)', () => {
    const page = parseQuestPage(fixture('quest-10482.html.gz'));
    expect(page.name).toBe('Fel Orc Scavengers');
    expect(page.chain).toEqual([
      { position: 1, quests: [{ name: 'Know your Enemy', current: false }] },
      { position: 2, quests: [{ name: 'Fel Orc Scavengers', current: true }] },
      { position: 3, quests: [{ name: 'Ill Omens', current: false }] },
    ]);
    expect(page.data.comments).toHaveLength(21);
  });

  it('reads a long chain (Arrival in Outland, step 7 of 9)', () => {
    const { chain } = parseQuestPage(fixture('quest-10288.html.gz'));
    expect(chain).toHaveLength(9);
    expect(chain[0].quests[0].name).toBe('A New Beginning');
    expect(chain[6]).toEqual({ position: 7, quests: [{ name: 'Arrival in Outland', current: true }] });
    expect(chain.filter((step) => step.quests.some((quest) => quest.current))).toHaveLength(1);
  });

  it('has no chain when the page has no Series box (The Ring of Blood: The Final Challenge)', () => {
    const page = parseQuestPage(fixture('quest-9977.html.gz'));
    expect(page.name).toBe('The Ring of Blood: The Final Challenge');
    expect(page.chain).toEqual([]);
  });

  it('reads the German page in German', () => {
    const page = parseQuestPage(fixture('quest-de-10482.html.gz'));
    expect(page.name).toBe('Plünderer der Höllenorcs');
    expect(page.chain.map((step) => step.quests[0].name)).toEqual(['Den Feind kennen', 'Plünderer der Höllenorcs', 'Schwarze Magie']);
  });

  it('decodes entities and keeps every quest of a branching step', () => {
    const html = '<h1 class="heading-size-1">Lieutenant&#039;s Orders</h1>'
      + '<table class="series"><tr><th>1.</th><td><div><a href="/tbc/quest=1/a">Arms &amp; Armor</a></div>'
      + '<div><a href="/tbc/quest=2/b">Shields</a></div></td></tr>'
      + '<tr><th>2.</th><td><div><b>Lieutenant&#039;s Orders</b></div></td></tr></table>';
    const page = parseQuestPage(html);
    expect(page.name).toBe("Lieutenant's Orders");
    expect(page.chain).toEqual([
      { position: 1, quests: [{ name: 'Arms & Armor', current: false }, { name: 'Shields', current: false }] },
      { position: 2, quests: [{ name: "Lieutenant's Orders", current: true }] },
    ]);
  });

  it('copes with a page that is not a quest page', () => {
    expect(parseQuestPage('<p>Nothing here</p>')).toMatchObject({ name: null, chain: [] });
  });
});
```

Create `app/test/questInfo.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildQuestInfo } from '../src/main/questInfo';
import { parseQuestPage } from '../src/main/questPage';
import { parseZoneNames } from '../src/main/zones';
import { fixture } from './fixtures';

const zones = parseZoneNames(fixture('global-tbc.js.gz'));
const info = (id: number, file: string) => buildQuestInfo(id, parseQuestPage(fixture(file)), zones);

describe('buildQuestInfo', () => {
  it('Fel Orc Scavengers: name, quest icon, chain and the best comments', () => {
    const quest = info(10482, 'quest-10482.html.gz');
    expect(quest).toMatchObject({ kind: 'quest', name: 'Fel Orc Scavengers', quality: 1, icon: 'quest-start', commentTotal: 21 });
    expect(quest?.chain).toHaveLength(3);
    expect(quest?.comments).toHaveLength(3);
  });

  it('takes the name from the heading, in the page language', () => {
    // The German page's Gatherer data names the quest in English first.
    expect(info(10482, 'quest-de-10482.html.gz')?.name).toBe('Plünderer der Höllenorcs');
  });

  it('The Ring of Blood: The Final Challenge: comments, no chain', () => {
    expect(info(9977, 'quest-9977.html.gz')).toMatchObject({ chain: [], commentTotal: 101 });
  });

  it('returns null when the page lacks the quest', () => {
    expect(info(1, 'quest-10482.html.gz')).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd app && npx vitest run test/questPage.test.ts test/questInfo.test.ts`
Expected: both files fail to load: `Failed to resolve import "../src/main/questPage"`.

- [ ] **Step 3: Implement**

In `app/src/main/markup.ts`, change `function decodeEntities(` to `export function decodeEntities(`.

Create `app/src/main/questPage.ts`:

```ts
import type { ChainQuest, ChainStep } from '../shared/types';
import { decodeEntities } from './markup';
import { parseItemPage, type ItemPage } from './wowheadPage';

/** What a Wowhead quest page holds that the popup shows. */
export interface QuestPage {
  /** The page heading: the quest's name in the page's language, or null. */
  name: string | null;
  /** The "Series" box's steps in order, or [] when the page has none. */
  chain: ChainStep[];
  /** The Gatherer data and comments, read as on item pages. */
  data: ItemPage;
}

const HEADING = /<h1 class="heading-size-1">([\s\S]*?)<\/h1>/;
const SERIES = /<table class="series">([\s\S]*?)<\/table>/;
// A step is "<tr><th>2.</th><td>…</td></tr>"; each <div> in the cell is one quest.
const STEP = /<tr>\s*<th>\s*(\d+)\.?\s*<\/th>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g;
const STEP_QUEST = /<div>([\s\S]*?)<\/div>/g;
const TAG = /<[^>]*>/g;

/** The text in some HTML: tags dropped, entities decoded, spaces tidied. */
function textOf(html: string): string {
  return decodeEntities(html.replace(TAG, '')).replace(/\s+/g, ' ').trim();
}

/** The quest on show is bold; the others are links to their pages. */
function readQuest(html: string): ChainQuest {
  return { name: textOf(html), current: !/<a\b/i.test(html) && /<b>/i.test(html) };
}

function readChain(html: string): ChainStep[] {
  const series = SERIES.exec(html);
  if (!series) return [];
  const steps: ChainStep[] = [];
  for (const [, position, cell] of series[1].matchAll(STEP)) {
    const quests = [...cell.matchAll(STEP_QUEST)].map(([, inner]) => readQuest(inner)).filter((quest) => quest.name !== '');
    if (quests.length > 0) steps.push({ position: Number(position), quests });
  }
  return steps;
}

/** Reads a Wowhead quest page: its heading, its chain, and the data item pages also have. */
export function parseQuestPage(html: string): QuestPage {
  const heading = HEADING.exec(html);
  const name = heading ? textOf(heading[1]) : '';
  return { name: name || null, chain: readChain(html), data: parseItemPage(html) };
}
```

Create `app/src/main/questInfo.ts`:

```ts
import type { QuestInfo } from '../shared/types';
import { pickComments } from './comments';
import { pageNames } from './itemInfo';
import type { QuestPage } from './questPage';
import type { ZoneNames } from './zones';

/** Wowhead's type number for quests in WH.Gatherer.addData. */
const QUEST_TYPE = 5;

/** Everything the popup shows for a quest, or null when the page doesn't have the quest's data. */
export function buildQuestInfo(questId: number, page: QuestPage, zones: ZoneNames): QuestInfo | null {
  const quest = page.data.gatherer.get(QUEST_TYPE)?.get(questId);
  if (!quest) return null;
  const { comments, total } = pickComments(page.data, pageNames(page.data, zones));
  return {
    kind: 'quest',
    // The heading is in the page's language; the Gatherer data can be in English.
    name: page.name ?? quest.name,
    quality: 1,
    icon: quest.icon ?? '',
    chain: page.chain,
    comments,
    commentTotal: total,
  };
}
```

- [ ] **Step 4: Run the tests and the type check**

Run: `cd app && npm test && npm run typecheck`
Expected: `Tests 167 passed (167)`; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/markup.ts app/src/main/questPage.ts app/src/main/questInfo.ts app/test/questPage.test.ts app/test/questInfo.test.ts
git commit -m "feat(app): read a Wowhead quest page's chain and comments" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Looking up quests

**Files:**
- Modify: `app/src/main/wowheadClient.ts`, `app/src/main/main.ts`, `app/package.json`
- Test: `app/test/wowheadClient.test.ts`

**Interfaces:**
- Consumes: `parseQuestPage` and `buildQuestInfo` (Task 6), plus the Task 5 shapes.
- Produces:
  - `WowheadClient.lookup(link)` answers quest links.
  - Cache keys are `` `${kind}-v2-${site}-${lang}-${id}` ``.
  - A quest's error header has icon `quest-start` when the tooltip service gives none.

- [ ] **Step 1: Write the failing tests for reading quests**

In `app/test/wowheadClient.test.ts`, after `const FEL_ORC = …`, add:

```ts
const FEL_ORC_TOOLTIP_URL = 'https://nether.wowhead.com/tbc/tooltip/quest/10482';
const felOrcPage = () => ok(`${FEL_ORC.url}/fel-orc-scavengers`, fixture('quest-10482.html.gz'));
```

Add inside `describe('WowheadClient')`:

```ts
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
      header: { kind: 'quest', name: 'Fel Orc Scavengers', quality: 1, icon: 'quest-start' },
    });
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd app && npx vitest run test/wowheadClient.test.ts`
Expected: both new tests fail.
- "reads a quest page" fails with `Error: error`: the item reader finds no item, so it's `changed`.
- The blocked test fails because `icon` is `''`.

- [ ] **Step 3: Read quests**

In `app/src/main/wowheadClient.ts`, add the imports:

```ts
import { buildQuestInfo } from './questInfo';
import { parseQuestPage } from './questPage';
```

After `CACHE_VERSION`, add:

```ts
/** Wowhead's icon for quests; its tooltip service gives quests none. */
const QUEST_ICON = 'quest-start';
```

In `lookup`, replace the line `const info = buildItemInfo(link.id, parseItemPage(page.html), await this.zoneNames(link));` with `const info = await this.read(link, page.html);`. Add this method after `lookup`:

```ts
  /** Reads a page with the reader for the link's kind; null when it doesn't hold what the link points at. */
  private async read(link: WowheadLink, html: string): Promise<LookupInfo | null> {
    const zones = await this.zoneNames(link);
    return link.kind === 'quest'
      ? buildQuestInfo(link.id, parseQuestPage(html), zones)
      : buildItemInfo(link.id, parseItemPage(html), zones);
  }
```

In `header`, change the `icon` line to:

```ts
        icon: typeof data.icon === 'string' ? data.icon : link.kind === 'quest' ? QUEST_ICON : '',
```

- [ ] **Step 4: Run the client tests**

Run: `cd app && npx vitest run test/wowheadClient.test.ts`
Expected: all pass.

- [ ] **Step 5: Write the failing test for the cache key**

Add inside `describe('WowheadClient')`:

```ts
  it('keeps a quest and an item with the same number apart', async () => {
    const sameNumber = link('https://www.wowhead.com/tbc/item=10482');
    const { client, asked } = setup({ [FEL_ORC.url]: felOrcPage(), [ZONES_URL]: zones() });
    expect((await client.lookup(FEL_ORC)).kind).toBe('ready');
    asked.length = 0;
    await client.lookup(sameNumber);
    expect(asked).toContain(sameNumber.url);
  });
```

Run: `cd app && npx vitest run test/wowheadClient.test.ts`
Expected: this test fails, with `asked` empty. The item lookup was answered from the quest's cache entry.

- [ ] **Step 6: Put the kind in the cache key**

In `lookup`, change the key to:

```ts
    const key = `${link.kind}-v${CACHE_VERSION}-${link.site || 'retail'}-${link.lang || 'en'}-${link.id}`;
```

- [ ] **Step 7: Say "item or quest" where the app describes itself**

- In `app/src/main/main.ts`, change the tray tooltip to `'Wowhead Gatherer: hold Ctrl over an item or quest in WoW and press C'`.
- In `app/package.json`, change `description` to `"Shows Wowhead's sources, quest chains and comments for the item or quest you copy in World of Warcraft."`.

- [ ] **Step 8: Run the tests and the type check**

Run: `cd app && npm test && npm run typecheck`
Expected: `Tests 170 passed (170)`; `tsc` prints nothing.

- [ ] **Step 9: Commit**

```bash
git add app/src/main/wowheadClient.ts app/src/main/main.ts app/package.json app/test/wowheadClient.test.ts
git commit -m "feat(app): look up quests, cached apart from items" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The quest chain in the popup

**Files:**
- Modify: `app/src/renderer/popup.ts`
- Test: `app/test/popup.test.ts`

**Interfaces:**
- Consumes: `QuestInfo`, `ChainStep` and `LookupKind` (Task 5).
- Produces: the DOM that Task 9 styles:
  - `h1.quest` for quest names;
  - `section.chain` > `h2` "Quest chain" > `ul` > `li`, with `span.position` ("1.") and `span.name`, which holds one `span` per quest (`span.current` for the quest on show), joined by " or ".

- [ ] **Step 1: Write the failing tests**

In `app/test/popup.test.ts`, change the types import to `import type { ItemInfo, PopupState, QuestInfo } from '../src/shared/types';`, and append:

```ts
const questLink = parseWowheadLink('https://www.wowhead.com/tbc/quest=10482')!;
const quest: QuestInfo = {
  kind: 'quest', name: 'Fel Orc Scavengers', quality: 1, icon: 'quest-start', commentTotal: 21,
  chain: [
    { position: 1, quests: [{ name: 'Know your Enemy', current: false }] },
    { position: 2, quests: [{ name: 'Fel Orc Scavengers', current: true }] },
    { position: 3, quests: [{ name: 'Ill Omens', current: false }, { name: 'Shields', current: false }] },
  ],
  comments: [{ user: 'Lustral', rating: 12, date: 'Jan 2008', body: [{ kind: 'text', text: 'North of Honor Hold.' }] }],
};
const all = (selector: string) => [...root.querySelectorAll(selector)].map((node) => node.textContent);

describe('renderState for quests', () => {
  it('shows the quest name in gold, with the quest icon', () => {
    show({ kind: 'ready', link: questLink, info: quest });
    expect(text('h1')).toBe('Fel Orc Scavengers');
    expect(root.querySelector('h1')?.className).toBe('quest');
    expect(root.querySelector('img')?.getAttribute('src')).toBe('https://wow.zamimg.com/images/wow/icons/large/quest-start.jpg');
  });

  it('lists the chain in order, marking the quest on show', () => {
    show({ kind: 'ready', link: questLink, info: quest });
    expect(text('.chain h2')).toBe('Quest chain');
    expect(all('.chain .position')).toEqual(['1.', '2.', '3.']);
    expect(all('.chain li .name')).toEqual(['Know your Enemy', 'Fel Orc Scavengers', 'Ill Omens or Shields']);
    expect(all('.chain .current')).toEqual(['Fel Orc Scavengers']);
    expect(text('.comments h2')).toBe('Comments (21)');
  });

  it('shows the quest number while a quest loads', () => {
    show({ kind: 'loading', link: questLink });
    expect(text('h1')).toBe('Quest 10482');
    expect(root.querySelector('h1')?.className).toBe('quest');
  });

  it('says so when Wowhead has no chain or comments for a quest', () => {
    show({ kind: 'ready', link: questLink, info: { ...quest, chain: [], comments: [], commentTotal: 0 } });
    expect(text('.status')).toBe('Wowhead lists no chain or comments for this quest.');
  });

  it('never turns quest names into HTML', () => {
    const evil = '<img src=x onerror=alert(1)>';
    show({ kind: 'ready', link: questLink, info: { ...quest, chain: [{ position: 1, quests: [{ name: evil, current: true }] }] } });
    expect(root.querySelectorAll('img')).toHaveLength(1); // just the quest icon
    expect(text('.chain .current')).toBe(evil);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd app && npx vitest run test/popup.test.ts`
Expected: the 5 new tests fail. The class is `q1`, there's no `.chain`, the name is `Item 10482`, and the empty message is the item's.

- [ ] **Step 3: Implement**

In `app/src/renderer/popup.ts`:

- Change the types import to `import type { ChainStep, ItemComment, MarkupNode, PageHeader, PopupState, SourceSection } from '../shared/types';`.
- In `renderHeader`, replace the two lines that compute `quality` and append the `h1` with:

```ts
  const quest = (item?.kind ?? state.link.kind) === 'quest';
  const quality = Math.min(Math.max(Math.trunc(item?.quality ?? 1), 0), MAX_QUALITY);
  const fallbackName = `${state.link.kind === 'quest' ? 'Quest' : 'Item'} ${state.link.id}`;
  // Quest names are gold, as in the game's quest log; items take their quality colour.
  header.append(el('h1', quest ? 'quest' : `q${quality}`, item?.name ?? fallbackName));
```

- After `renderSection`, add:

```ts
function renderChain(chain: ChainStep[]): HTMLElement {
  const block = el('section', 'chain');
  block.append(el('h2', undefined, 'Quest chain'));
  const list = el('ul');
  for (const step of chain) {
    const row = el('li');
    const names = el('span', 'name');
    step.quests.forEach((quest, i) => {
      if (i > 0) names.append(' or ');
      names.append(el('span', quest.current ? 'current' : undefined, quest.name));
    });
    row.append(el('span', 'position', `${step.position}.`), names);
    list.append(row);
  }
  block.append(list);
  return block;
}
```

- In `renderState`, replace everything after the error branch with:

```ts
  const { info } = state;
  if (info.kind === 'item') root.append(...info.sections.map(renderSection));
  else if (info.chain.length > 0) root.append(renderChain(info.chain));
  if (info.comments.length > 0) {
    const block = el('section', 'comments');
    block.append(el('h2', undefined, `Comments (${info.commentTotal})`), ...info.comments.map(renderComment));
    root.append(block);
  }
  const listsNothing = info.kind === 'item' ? info.sections.length === 0 : info.chain.length === 0;
  if (listsNothing && info.comments.length === 0) {
    root.append(el('p', 'status', info.kind === 'item'
      ? 'Wowhead lists no sources or comments for this item.'
      : 'Wowhead lists no chain or comments for this quest.'));
  }
```

- [ ] **Step 4: Run the tests and the type check**

Run: `cd app && npm test && npm run typecheck`
Expected: `Tests 175 passed (175)`; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add app/src/renderer/popup.ts app/test/popup.test.ts
git commit -m "feat(app): show a quest's chain in the popup" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The WoW look

**Files:**
- Create: `app/static/fonts/Marcellus-Regular.ttf`, `app/static/fonts/OFL.txt` (downloaded), `app/test/static.test.ts`
- Modify: `app/static/popup.css` (rewritten), `app/static/popup.html`, `app/src/main/popupWindow.ts`

**Interfaces:**
- Consumes: the DOM from Tasks 5 and 8: `#popup`, `header`, `.icon`, `h1.q0`…`.q7`, `h1.quest`, `button.open`, `button.close`, `section` / `h2` / `ul` / `li` / `.name` / `.details` / `.more`, `section.chain` with `.position` / `.current`, `section.comments` / `article.comment` / `.meta` / `.body`, and `.status` / `.status.error`.
- Produces: the styles. The window is see-through so the rounded frame shows the game behind its corners.

- [ ] **Step 1: Write the failing tests**

Create `app/test/static.test.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const STATIC = new URL('../static/', import.meta.url);
const read = (name: string) => readFileSync(new URL(name, STATIC), 'utf8');

describe('popup page', () => {
  it('may load its own fonts, and nothing else new', () => {
    const policy = /content="([^"]+)"/.exec(read('popup.html'))?.[1] ?? '';
    expect(policy.split(';').map((part) => part.trim())).toEqual([
      "default-src 'none'", "script-src 'self'", "style-src 'self'", 'img-src https://wow.zamimg.com', "font-src 'self'",
    ]);
  });

  it('bundles every font its stylesheet asks for, with the licence', () => {
    const fonts = [...read('popup.css').matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((match) => match[1]);
    expect(fonts).toEqual(['fonts/Marcellus-Regular.ttf']);
    for (const font of fonts) expect(existsSync(new URL(font, STATIC))).toBe(true);
    expect(existsSync(new URL('fonts/OFL.txt', STATIC))).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd app && npx vitest run test/static.test.ts`
Expected: both fail. The policy has no `font-src`, and the stylesheet has no `url(…)`.

- [ ] **Step 3: Bundle the font**

```bash
mkdir -p app/static/fonts
curl -sL "https://github.com/google/fonts/raw/main/ofl/marcellus/Marcellus-Regular.ttf" -o app/static/fonts/Marcellus-Regular.ttf
curl -sL "https://github.com/google/fonts/raw/main/ofl/marcellus/OFL.txt" -o app/static/fonts/OFL.txt
```

Check: `ls -la app/static/fonts`. Expected: `Marcellus-Regular.ttf` is about 46 KB. `OFL.txt` starts with a "Copyright" line and contains "SIL OPEN FONT LICENSE".

- [ ] **Step 4: Allow the font in the page's policy**

In `app/static/popup.html`, change the CSP `content` to:

```
default-src 'none'; script-src 'self'; style-src 'self'; img-src https://wow.zamimg.com; font-src 'self'
```

- [ ] **Step 5: Rewrite the stylesheet**

Replace `app/static/popup.css` with:

```css
/* Blizzard's modern panel look (dark brown, gold-brown rims, gold headings, red
   buttons), drawn in CSS: no game artwork is copied. Marcellus (SIL Open Font
   License) stands in for the game's Friz Quadrata, which is a paid font. */
@font-face {
  font-family: 'Marcellus';
  src: url('fonts/Marcellus-Regular.ttf') format('truetype');
}

:root {
  color-scheme: dark;
  --frame-centre: #3b1f12;
  --frame-edge: #130b07;
  --rim: #5c4a35;
  --inset: rgba(0, 0, 0, 0.25);
  --inset-rim: #4a3a2a;
  --gold: #ffd100;
  --text: #ffffff;
  --muted: #b5a98f;
  --error: #ff4040;
  --button-top: #a01010;
  --button-bottom: #5a0505;
  --button-rim: #8c7b5a;
  font: 14px/1.4 'Marcellus', Georgia, serif;
}

/* The window is see-through, so the frame's rounded corners show the game behind. */
html, body { margin: 0; height: 100%; overflow: hidden; background: transparent; color: var(--text); }

#popup {
  box-sizing: border-box;
  max-height: 100vh;
  overflow-y: auto;
  padding: 10px 12px 12px;
  /* A thin black edge, with the gold-brown rim just inside it. */
  border: 1px solid #000;
  border-radius: 6px;
  box-shadow: inset 0 0 0 1px var(--rim);
  background: radial-gradient(ellipse at 50% 40%, var(--frame-centre), var(--frame-edge) 85%);
}
#popup::-webkit-scrollbar { width: 8px; }
#popup::-webkit-scrollbar-track { margin: 6px 0; background: rgba(0, 0, 0, 0.3); border-radius: 4px; }
#popup::-webkit-scrollbar-thumb { background: var(--rim); border-radius: 4px; }

header { display: flex; align-items: center; gap: 8px; }
.icon { width: 36px; height: 36px; border: 1px solid var(--inset-rim); border-radius: 4px; box-shadow: 0 0 0 1px #000; }
h1 { flex: 1; margin: 0; font-size: 17px; font-weight: normal; text-shadow: 1px 1px 0 #000; }
.quest { color: var(--gold); }

/* The game's red panel buttons, gold text on red with a light rim. */
button {
  font: inherit; font-size: 13px; color: var(--gold); cursor: pointer;
  padding: 3px 10px;
  background: linear-gradient(to bottom, var(--button-top), var(--button-bottom));
  border: 1px solid var(--button-rim); border-radius: 3px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18), 0 0 0 1px #000;
  text-shadow: 1px 1px 0 #000;
}
button:hover { background: linear-gradient(to bottom, #c01818, #700808); }
button:active { background: linear-gradient(to bottom, var(--button-bottom), var(--button-top)); }
.close { width: 22px; height: 22px; padding: 0; font-size: 16px; line-height: 20px; }

/* Each block sits in its own inset panel, like the boxes on Blizzard's settings pages. */
section {
  margin-top: 8px; padding: 6px 10px 8px;
  background: var(--inset); border: 1px solid var(--inset-rim); border-radius: 6px;
}
h2 { margin: 0 0 4px; font-size: 14px; font-weight: normal; color: var(--gold); text-shadow: 1px 1px 0 #000; }
ul { list-style: none; margin: 0; padding: 0; }
li { display: flex; justify-content: space-between; gap: 12px; padding: 2px 0; }
li + li { border-top: 1px solid rgba(92, 74, 53, 0.35); }
.details { color: var(--muted); text-align: right; }
.more { color: var(--muted); font-style: italic; }

/* Marcellus has one weight, and a faked bold smears it, so the quest on show is just gold. */
.chain li { justify-content: flex-start; gap: 6px; }
.chain .position { min-width: 1.6em; color: var(--muted); text-align: right; }
.chain .current { color: var(--gold); }

.status { margin: 8px 0 0; color: var(--muted); }
.status.error { color: var(--error); }

/* The comments block is a heading; each comment is its own panel. */
section.comments { padding: 0; background: none; border: none; }
.comment { margin-top: 6px; padding: 6px 8px; background: var(--inset); border: 1px solid var(--inset-rim); border-radius: 6px; }
.meta { margin: 0 0 3px; color: var(--gold); font-size: 12px; opacity: 0.85; }
.body blockquote { margin: 4px 0; padding-left: 8px; border-left: 2px solid var(--rim); color: var(--muted); }
.list-item::before { content: "• "; }

/* Item quality colours, as in the game. */
.q0 { color: #9d9d9d; } .q1 { color: #ffffff; } .q2 { color: #1eff00; } .q3 { color: #0070dd; }
.q4 { color: #a335ee; } .q5 { color: #ff8000; } .q6 { color: #e6cc80; } .q7 { color: #00ccff; }
```

- [ ] **Step 6: Make the window see-through**

In `app/src/main/popupWindow.ts`'s `BrowserWindow` options, replace `backgroundColor: '#0b0e17',` with:

```ts
      // See-through, so the frame's rounded corners show the game behind them.
      transparent: true,
      backgroundColor: '#00000000',
```

- [ ] **Step 7: Run the tests, the type check and the build**

Run: `cd app && npm test && npm run typecheck && npm run build`
Expected: `Tests 177 passed (177)`; `tsc` prints nothing; esbuild writes `dist/main.js`, `dist/preload.js` and `dist/popup.js` with no errors.

- [ ] **Step 8: Render the popup and compare it with the reference**

This step's files are throwaway and stay in `$SCRATCH`, uncommitted. Write `$SCRATCH/preview-popup.cjs`:

```js
// Throwaway: renders the built popup with sample states to PNGs, to compare with the reference.
// Usage: electron preview-popup.cjs <app folder> <states.json> <output folder>
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const [appDir, statesFile, outDir] = process.argv.slice(-3);
const states = JSON.parse(fs.readFileSync(statesFile, 'utf8'));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 420, height: 560, show: false, frame: false, transparent: true, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(appDir, 'dist', 'preload.js'), contextIsolation: true, sandbox: true, offscreen: true },
  });
  await win.loadFile(path.join(appDir, 'static', 'popup.html'));
  for (const [name, state] of Object.entries(states)) {
    win.webContents.send('popup:state', state);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    fs.writeFileSync(path.join(outDir, `popup-${name}.png`), (await win.webContents.capturePage()).toPNG());
  }
  app.quit();
});
```

Write `$SCRATCH/popup-states.json`. These are sample states, not Wowhead data:

```json
{
  "item": { "kind": "ready",
    "link": { "url": "https://www.wowhead.com/tbc/item=21877", "site": "tbc", "lang": "", "kind": "item", "id": 21877 },
    "info": { "kind": "item", "name": "Netherweave Cloth", "quality": 1, "icon": "inv_fabric_netherweave", "commentTotal": 64,
      "sections": [
        { "title": "Dropped by", "total": 412, "rows": [
          { "name": "Heckling Fel Sprite", "details": ["Hellfire Peninsula", "83%"] },
          { "name": "Bonechewer Devastator", "details": ["Hellfire Peninsula", "41%"] },
          { "name": "Arakkoa Outcast", "details": ["Terokkar Forest", "38%"] } ] },
        { "title": "Fished in", "total": 2, "rows": [ { "name": "Zangarmarsh", "details": ["0.86%"] } ] } ],
      "comments": [
        { "user": "", "rating": 120, "date": "Feb 2007", "body": [ { "kind": "bold", "children": [ { "kind": "text", "text": "Tip:" } ] }, { "kind": "text", "text": " the fel sprites outside Thrallmar drop it fastest." } ] },
        { "user": "Koen", "rating": 45, "date": "Mar 2007", "body": [ { "kind": "text", "text": "Tailors need stacks of this for Bolts of Netherweave." } ] } ] } },
  "quest": { "kind": "ready",
    "link": { "url": "https://www.wowhead.com/tbc/quest=10482", "site": "tbc", "lang": "", "kind": "quest", "id": 10482 },
    "info": { "kind": "quest", "name": "Fel Orc Scavengers", "quality": 1, "icon": "quest-start", "commentTotal": 21,
      "chain": [
        { "position": 1, "quests": [ { "name": "Know your Enemy", "current": false } ] },
        { "position": 2, "quests": [ { "name": "Fel Orc Scavengers", "current": true } ] },
        { "position": 3, "quests": [ { "name": "Ill Omens", "current": false } ] } ],
      "comments": [ { "user": "Lustral", "rating": 12, "date": "Jan 2008", "body": [ { "kind": "text", "text": "The Bonechewer orcs are north of Honor Hold, along the Path of Glory." } ] } ] } },
  "error": { "kind": "error",
    "link": { "url": "https://www.wowhead.com/tbc/item=28773", "site": "tbc", "lang": "", "kind": "item", "id": 28773 },
    "message": "Wowhead didn't let the app read this page. Open it on Wowhead instead.",
    "header": { "kind": "item", "name": "Gorehowl", "quality": 4, "icon": "inv_axe_60" } }
}
```

Run (from `app/`):

```bash
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron "$SCRATCH/preview-popup.cjs" "$(pwd)" "$SCRATCH/popup-states.json" "$SCRATCH"
```

Expected: `popup-item.png`, `popup-quest.png` and `popup-error.png` in `$SCRATCH`.

Look at each PNG with the Read tool, next to the reference screenshot `$SCRATCH/../images/1.png`. Check:
- the dark brown frame, warmer in the middle;
- the rounded gold-brown rim, with clear (see-through) corners;
- gold headings and section titles;
- the inset panels;
- the red buttons with gold text;
- Marcellus is in use: serif glyphs with flared ends, not Segoe UI.

If a colour or spacing is clearly off, adjust it in `popup.css`, rebuild (`npm run build`) and render again. Rule on anything you change, and record it in the ledger.

- [ ] **Step 9: Commit**

```bash
git add app/static app/src/main/popupWindow.ts app/test/static.test.ts
git commit -m "feat(app): the popup takes on the game's panel look" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Notes, the program, and the final check

**Files:**
- Modify: `CLAUDE.md`, `../CLAUDE.md` (`D:\Development\WoW Addons\CLAUDE.md`, not in this repo)
- Rebuild: `app/release/Wowhead Gatherer 0.1.0.exe` (ignored by git)

**Interfaces:**
- Consumes: everything above.
- Produces: up-to-date notes and a rebuilt portable program.

- [ ] **Step 1: Update the project notes**

In `CLAUDE.md`:

**Opening paragraph.** Replace the first sentence's "Hover any item in World of Warcraft and press **Ctrl+C once**. A popup beside the cursor, over the game, shows Wowhead's sources for the item (drops with chances, vendors, quests, crafting, containers, gathering) and its best comments" with "Hover any item or quest in World of Warcraft and press **Ctrl+C once**. A popup beside the cursor, over the game, shows what Wowhead knows: for an item, its sources (drops with chances, vendors, quests, crafting, containers, gathering); for a quest, its chain; for both, the best comments".

**Second paragraph.** Replace it with:

```
It targets **Burning Crusade Anniversary** (2.5.6) on Windows 11, and also loads in **WoW Forever** (`## Interface: 20506, 16001`; 16001 is a guess until Forever launches on 2026-11-04, so check `/dump select(4, GetBuildInfo())` there). It replaces the Wowhead Lookup add-on it started from. Designs: `docs/superpowers/specs/2026-10-09-wowhead-gatherer-design.md` and `docs/superpowers/specs/2026-10-10-quests-and-wow-look-design.md`; plans in `docs/superpowers/plans/`.
```

**"Two halves, one contract".**
- In the add-on bullet, change "Holding Ctrl over an item readies the item's Wowhead link" to "Holding Ctrl over an item or quest readies its Wowhead link".
- In the app bullet, change "reads the item's Wowhead page" to "reads the item's or quest's Wowhead page".
- Change the contract bullet to: ``- **The contract** is the link: `https://www.wowhead.com/[site/][lang/]<item|quest>=<id>`, with the language **after** the site. Change it on both sides or neither.``

**"Hard limits".** Change the bullet "Wowhead's item pages sit behind AWS WAF." to begin "Wowhead's item and quest pages sit behind AWS WAF." Keep the rest of that bullet.

**"Add-on files" table.**
- Change the rows for `Core.lua`, `Url.lua`, `Lookup.lua` and `Popup.lua`, and add a `Quests.lua` row after `Lookup.lua`:

```
| `Core.lua` | Defaults, SavedVariables (`WowheadGathererDB`, `WowheadGathererCharDB`), event dispatch to `ns:EVENT()`, `ns:LookupHovered`, `ns:TryOfferDefaultKey`, `/whg`. |
| `Url.lua` | `ns.BuildURL(kind, id, projectID, locale)` (`BuildItemURL` wraps it), `ns.ParseItemLink`, `ns.ParseQuestLink`. |
| `Lookup.lua` | `ns.GetHoveredItem()` (on TBC, `GetItem()`; `TooltipUtil` exists only on mainline-family clients) and `ns.GetHovered()` → `kind, id, label`, items first. |
| `Quests.lua` | `ns.GetHoveredQuest()`: quest log titles and Forever's tracker through `EventRegistry` hover announcements, TBC's tracker lines through a `QuestWatch_Update` post-hook, chat quest links through `ItemRefTooltip:SetHyperlink`. Every TBC-only global is behind an existence check. |
| `Popup.lua` | `ns.CreateCopyWatcher()`, `ns:ShowCopyPopup(url, kind, id, label)`, `ns.MODIFIER_KEYS`. The fallback link popup. |
```

- In the `ReadyCopy.lua` row, add: "A readied quest lets go when the cursor leaves it (the box's `OnUpdate`)."

**"App files" table.**
- Change the `shared/types.ts` row's description to "`ItemInfo`, `QuestInfo`, `PageHeader`, `PopupState` and friends; `formatMoney`."
- Add after the `main/markup.ts…` row:

```
| `main/questPage.ts`, `main/questInfo.ts` | A quest page's heading and "Series" box; the quest's popup info. |
| `static/popup.css`, `static/fonts/` | The game's panel look in CSS; Marcellus (SIL OFL) stands in for Friz Quadrata. |
```

**"Backlog".** Replace it with: `Spells and NPCs; Questie's tracker; the full tooltip; localised zone names; starting with Windows and an installer; checking Forever at launch (its interface number, program name and \`/forever/\` pages).`

- [ ] **Step 2: Update the folder overview**

In `D:\Development\WoW Addons\CLAUDE.md`, change the `WowheadGatherer\` row's description to:

```
Hover an item or quest and press Ctrl+C once: a desktop app shows Wowhead's sources, quest chain and comments in a popup over the game. The add-on sits at the root and the Electron app in `app\`. Loads in TBC Anniversary and WoW Forever. A git repo with pytest + lupa and Vitest tests.
```

- [ ] **Step 3: Run every check**

Run (repo root): `.venv/Scripts/python -m pytest tests -q`
Expected: `151 passed`.

Run: `cd app && npm test && npm run typecheck`
Expected: `Tests 177 passed (177)`; `tsc` prints nothing.

- [ ] **Step 4: Rebuild the program**

Run: `cd app && npm run dist`
Expected: electron-builder ends with no error, and `app/release/Wowhead Gatherer 0.1.0.exe` has today's time.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: notes for quests, the WoW look and WoW Forever" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

The folder overview, `D:\Development\WoW Addons\CLAUDE.md`, is outside this repo and isn't under git. It's saved, not committed.
